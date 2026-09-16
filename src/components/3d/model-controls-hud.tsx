'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, LazyMotion, domAnimation } from 'motion/react';
import * as m from 'motion/react-m';
import { useEngineStore } from '@/store/useEngineStore';
import { useViewportStore } from '@/store/useViewportStore';
import { getSceneKey, type SceneKey } from './scene-orchestrator';

const ABOUT_ME_FILES = ['overview', 'profile', 'contact-info'];

/**
 * The gestures the viewport understands. `pause` is universal and lives on the
 * button itself, so it is not part of the per-scene table.
 */
type Gesture = 'walk' | 'drag' | 'zoom' | 'click' | 'hover';

/**
 * What each scene actually responds to, keyed exactly like scene-orchestrator's
 * `SceneKey`. Chips are rendered from this table, so a scene never advertises a
 * gesture it ignores.
 *
 * NOTE: `click` (select/assemble) and `hover` (disturb) are wired in the
 * viewport — canvas-wrapper's PointerGrammar does the <5px click-vs-drag
 * discrimination and re-broadcasts real clicks as `viewport:click` — but no
 * scene registers an `onClick`/`onPointerOver` handler yet, so no scene lists
 * them here. Add the gesture to a scene's row in the same change that adds the
 * handler and the chip appears.
 */
const SCENE_GESTURES: Record<SceneKey, readonly Gesture[]> = {
  'ibm-staff-swe': ['drag', 'zoom'],
  'indeed-sr-swe': ['drag', 'zoom'],
  hammerball: ['drag', 'zoom'],
  combat_system: ['drag', 'zoom'],
  'about-me': ['walk', 'drag', 'zoom'],
  default: ['drag', 'zoom'],
};

/** Chip copy: the cap(s) on the left, what they do on the right. */
const GESTURE_CHIPS: Record<Exclude<Gesture, 'walk'>, { caps: string[]; label: string }> = {
  drag: { caps: ['Drag'], label: 'Rotate' },
  zoom: { caps: ['Scroll'], label: 'Zoom' },
  click: { caps: ['Click'], label: 'Select' },
  hover: { caps: ['Hover'], label: 'Disturb' },
};

/** True when a keystroke belongs to a form control and must not be hijacked. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON', 'A'].includes(el.tagName);
}

/** Shared cap styling — neutral, so the role tokens keep their one job each. */
const CAP_CLASS =
  'flex h-6 min-w-6 items-center justify-center border-2 border-border bg-bg-editor px-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-text-primary shadow-[3px_3px_0_#161310]';

export function ModelControlsHUD() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const [hasInteracted, setHasInteracted] = useState(false);
  const prevFileId = useRef(activeFileId);

  useEffect(() => {
    const isCurrentlyAboutMe = activeFileId ? ABOUT_ME_FILES.includes(activeFileId) : false;
    const wasAboutMe = prevFileId.current ? ABOUT_ME_FILES.includes(prevFileId.current) : false;
    
    // If transitioning into the About Me folder from outside, reset interaction state
    if (isCurrentlyAboutMe && !wasAboutMe) {
      setHasInteracted(false);
    }
    
    prevFileId.current = activeFileId;
  }, [activeFileId]);

  useEffect(() => {
    const isAboutMe = activeFileId ? ABOUT_ME_FILES.includes(activeFileId) : false;
    if (!isAboutMe || hasInteracted) return;

    const handleInteraction = (e: Event) => {
      if (e.type === 'keydown') {
        const keys = ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (keys.includes((e as KeyboardEvent).key)) {
          setHasInteracted(true);
        }
      }
    };

    window.addEventListener('keydown', handleInteraction);
    return () => {
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [activeFileId, hasInteracted]);

  const isAboutMe = activeFileId ? ABOUT_ME_FILES.includes(activeFileId) : false;

  const viewportMode = useViewportStore((s) => s.mode);
  const paused = useViewportStore((s) => s.paused);
  const togglePaused = useViewportStore((s) => s.togglePaused);

  // SPACE toggles pause — except while typing, and except when a button or
  // link has focus (the browser already activates those with Space/Enter, so
  // handling it here too would toggle twice).
  useEffect(() => {
    if (viewportMode !== 'live') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      useViewportStore.getState().togglePaused();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewportMode]);

  const gestures = SCENE_GESTURES[getSceneKey(activeFileId)] ?? SCENE_GESTURES.default;
  const pointerGestures = gestures.filter((g): g is Exclude<Gesture, 'walk'> => g !== 'walk');
  const showWalk = gestures.includes('walk') && !hasInteracted;

  // The HUD describes what the live canvas can do — it means nothing over the
  // still preview or the text fallback.
  if (viewportMode !== 'live') return null;

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        <m.div
          key="controls-hud"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="absolute bottom-[18dvh] sm:bottom-8 left-1/2 -translate-x-1/2 z-[60] flex items-center justify-center pointer-events-none"
        >
          <div className="flex flex-col items-center gap-3">
            {/* Gesture legend — one bar, one visual idiom, chips filtered per scene */}
            <div className="hidden sm:flex items-center gap-3 border-[3px] border-border bg-bg-panel px-4 py-2.5 shadow-[6px_6px_0_#161310]">
              {/* Desktop WASD Controls - hides after interaction */}
              {showWalk && (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
                    Walk
                  </span>
                  <div className="flex gap-1.5">
                    {['W', 'A', 'S', 'D'].map((key) => (
                      <div
                        key={key}
                        className="flex h-6 w-6 items-center justify-center border-2 border-border bg-lime font-mono text-[11px] font-bold text-ink shadow-[3px_3px_0_#161310]"
                      >
                        {key}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pointerGestures.map((gesture) => {
                const chip = GESTURE_CHIPS[gesture];
                return (
                  <div key={gesture} className="flex items-center gap-1.5">
                    {chip.caps.map((cap) => (
                      <span key={cap} className={CAP_CLASS}>
                        {cap}
                      </span>
                    ))}
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
                      {chip.label}
                    </span>
                  </div>
                );
              })}

              <PauseButton paused={paused} onToggle={togglePaused} />
            </div>

            {/* Mobile: pause stays reachable even without the legend bar */}
            <div className="flex sm:hidden items-center gap-3 border-[3px] border-border bg-bg-panel px-3 py-2 shadow-[6px_6px_0_#161310]">
              <PauseButton paused={paused} onToggle={togglePaused} />
            </div>

            {/* Mobile Virtual D-Pad - always visible on mobile while in About Me, pointer-events-auto */}
            {isAboutMe && <VirtualDPad />}
          </div>
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}

/**
 * PauseButton — stops every moving thing in the viewport (motion sensitivity,
 * and it stops burning laptop battery on an idle tab). SPACE is wired to the
 * same action. 44px minimum target, visible focus ring, `aria-pressed` so the
 * toggle state is announced.
 */
function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  const handleClick = useCallback(() => onToggle(), [onToggle]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={paused}
      aria-label={paused ? 'Resume 3D motion' : 'Pause 3D motion'}
      title={paused ? 'Resume motion (Space)' : 'Pause motion (Space)'}
      className={`pointer-events-auto flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 border-[3px] border-border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] shadow-[4px_4px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive ${
        paused ? 'bg-interactive text-interactive-ink' : 'bg-bg-editor text-text-primary'
      }`}
    >
      <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
      <span>{paused ? 'Resume' : 'Pause'}</span>
      <span
        aria-hidden="true"
        className={`hidden sm:inline border-2 border-border px-1 text-[10px] ${
          paused ? 'bg-bg-editor text-text-primary' : 'bg-bg-panel text-text-muted'
        }`}
      >
        Space
      </span>
    </button>
  );
}

function VirtualDPad() {
  const setGestureDragging = useEngineStore((s) => s.setGestureDragging);
  const [activeDirection, setActiveDirection] = useState<string | null>(null);
  const activeDirRef = useRef<string | null>(null);
  const isMouseDown = useRef(false);

  const simulateKey = (type: 'keydown' | 'keyup', key: string) => {
    window.dispatchEvent(new KeyboardEvent(type, { key }));
  };

  const updateActiveDirection = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    const dpadBtn = element?.closest('[data-direction]');
    const direction = dpadBtn?.getAttribute('data-direction');

    if (direction !== activeDirRef.current) {
      if (activeDirRef.current) simulateKey('keyup', activeDirRef.current);
      if (direction) simulateKey('keydown', direction);

      activeDirRef.current = direction || null;
      setActiveDirection(direction || null);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setGestureDragging(true);
    const touch = e.touches[0];
    updateActiveDirection(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    updateActiveDirection(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      setGestureDragging(false);
      if (activeDirRef.current) {
        simulateKey('keyup', activeDirRef.current);
        activeDirRef.current = null;
        setActiveDirection(null);
      }
    } else {
      const touch = e.touches[0];
      updateActiveDirection(touch.clientX, touch.clientY);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isMouseDown.current = true;
    setGestureDragging(true);
    updateActiveDirection(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown.current) return;
    updateActiveDirection(e.clientX, e.clientY);
  };

  const handleMouseUpOrLeave = () => {
    if (!isMouseDown.current) return;
    isMouseDown.current = false;
    setGestureDragging(false);
    if (activeDirRef.current) {
      simulateKey('keyup', activeDirRef.current);
      activeDirRef.current = null;
      setActiveDirection(null);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isMouseDown.current) {
        isMouseDown.current = false;
        setGestureDragging(false);
        if (activeDirRef.current) {
          simulateKey('keyup', activeDirRef.current);
          activeDirRef.current = null;
          setActiveDirection(null);
        }
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [setGestureDragging]);

  return (
    <div
      className="sm:hidden flex items-center justify-center gap-1 border-[3px] border-border bg-bg-panel p-3 shadow-[6px_6px_0_#161310] pointer-events-auto touch-none select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
    >
      <div className="grid grid-cols-3 grid-rows-2 gap-1 place-items-center">
        <div />
        <DPadButton directionKey="w" label="▲" isActive={activeDirection === 'w'} />
        <div />
        <DPadButton directionKey="a" label="◀" isActive={activeDirection === 'a'} />
        <DPadButton directionKey="s" label="▼" isActive={activeDirection === 's'} />
        <DPadButton directionKey="d" label="▶" isActive={activeDirection === 'd'} />
      </div>
    </div>
  );
}

function DPadButton({ directionKey, label, isActive }: { directionKey: string; label: string; isActive: boolean }) {
  return (
    <button
      data-direction={directionKey}
      className={`flex h-8 w-8 items-center justify-center border-2 border-border font-mono text-xs font-bold text-text-primary touch-none select-none transition-transform duration-75 ${
        isActive
          ? 'translate-x-[2px] translate-y-[2px] bg-cobalt text-white shadow-none'
          : 'bg-bg-editor shadow-[3px_3px_0_#161310]'
      }`}
    >
      {label}
    </button>
  );
}
