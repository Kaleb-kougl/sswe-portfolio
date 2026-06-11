'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, LazyMotion, domAnimation } from 'motion/react';
import * as m from 'motion/react-m';
import { useEngineStore } from '@/store/useEngineStore';

const ABOUT_ME_FILES = ['overview', 'profile', 'contact-info'];

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

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isAboutMe && (
          <m.div
            key="controls-hud"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="absolute bottom-[18dvh] sm:bottom-8 left-1/2 -translate-x-1/2 z-[60] flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3">
              {/* Desktop WASD Controls - hides after interaction */}
              {!hasInteracted && (
                <div className="hidden sm:flex items-center gap-3 rounded-full border border-border/40 bg-bg-panel/80 px-4 py-2.5 backdrop-blur-md shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Walk</span>
                  <div className="flex gap-1.5">
                    {['W', 'A', 'S', 'D'].map((key) => (
                      <div
                        key={key}
                        className="flex h-6 w-6 items-center justify-center rounded bg-bg-editor font-mono text-[11px] font-bold text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_2px_rgba(0,0,0,0.4)] ring-1 ring-border/50"
                      >
                        {key}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Mobile Virtual D-Pad - always visible on mobile while in About Me, pointer-events-auto */}
              <VirtualDPad />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
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
      className="sm:hidden flex items-center justify-center gap-1 rounded-3xl border border-border/40 bg-bg-panel/80 p-3 backdrop-blur-md shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)] pointer-events-auto touch-none select-none"
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
      className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs font-bold text-text-primary ring-1 ring-border/50 touch-none select-none transition-all duration-75 ${
        isActive
          ? 'bg-bg-editor/70 translate-y-[1px] shadow-none'
          : 'bg-bg-editor shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.5)]'
      }`}
    >
      {label}
    </button>
  );
}
