'use client';

import { useRef, useEffect, useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LazyMotion, domAnimation } from 'motion/react';
import * as m from 'motion/react-m';
import { useEngineStore, type TransientUpdates } from '@/store/useEngineStore';
import {
  RESUME_DATA,
  CONTACT_INFO,
  SUMMARY,
  EDUCATION,
  SKILLS,
  type ProjectEntry,
} from '@/data/resumeData';
import { FILE_TREE, type FileNode } from '@/data/fileTree';
import { COMBAT_SYSTEM_PATTERN_LABELS, type CombatSystemPattern } from '@/components/3d/scenes/combat-system-types';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { LevelTimeline, EXPERIENCE_FILE_IDS } from '@/components/level-timeline';

// --- Eyebrow paths, derived from the Hierarchy file tree --------------------
// The eyebrow must read exactly like the Hierarchy, so it is built by walking
// FILE_TREE once at module load instead of being hand-maintained.
const FILE_PATH_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const walk = (nodes: FileNode[], trail: string[]) => {
    for (const node of nodes) {
      const next = [...trail, node.label];
      if (node.isFolder && node.children) {
        walk(node.children, next);
      } else {
        map[node.id] = next.join(' / ').toUpperCase();
      }
    }
  };
  walk(FILE_TREE, []);
  return map;
})();

function filePathFor(entry: ProjectEntry): string {
  return (
    FILE_PATH_MAP[entry.fileId] ??
    `${entry.type ?? 'FILE'} / ${entry.fileId}`.toUpperCase()
  );
}

// --- COMPILE_IN timings (whole sequence stays under 500ms) ------------------
const SCRAMBLE_MS = 240;
const BULLET_STAGGER_S = 0.07;
const BULLET_MAX_DELAY_S = 0.28;
const BULLET_DURATION_S = 0.18;
const SCRAMBLE_CHARS = '!<>-_\\/[]{}=+*^?#0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Scrambles `finalText` through random characters once, then settles.
 *
 * Starts — and server-renders — as the real string, so the first paint is
 * always readable content; the scramble only begins in an effect, after paint.
 * Returns `finalText` untouched when motion is reduced.
 */
function useScrambledText(finalText: string, enabled: boolean): string {
  const [text, setText] = useState(finalText);
  const [lastText, setLastText] = useState(finalText);

  // Re-sync during render (not in an effect) so a newly selected file never
  // paints the previous file's path for a frame.
  if (lastText !== finalText) {
    setLastText(finalText);
    setText(finalText);
  }

  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now: number) {
      const progress = Math.min(1, (now - start) / SCRAMBLE_MS);
      const settled = Math.floor(finalText.length * progress);
      let out = finalText.slice(0, settled);
      for (let i = settled; i < finalText.length; i++) {
        out +=
          finalText[i] === ' '
            ? ' '
            : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      setText(out);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setText(finalText);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [finalText, enabled]);

  return text;
}

// --- Helper for Linkifying Text ---
function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|(?:https?:\/\/[^\s]+)|(?:linkedin\.com[^\s]+)|(?:[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+))/g);

  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
        } else if (part.match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+$/)) {
          return (
            <a key={i} href={`mailto:${part}`} className="font-semibold text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-status hover:text-status-ink">
              {part}
            </a>
          );
        } else if (part.match(/^(https?:\/\/|linkedin\.com)/)) {
          const href = part.startsWith('http') ? part : `https://${part}`;
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-status hover:text-status-ink">
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// --- Control metadata matching TDD §2.3 Controls Specification Table ---
interface SliderControl {
  type: 'slider';
  label: string;
  field: keyof TransientUpdates;
  min: number;
  max: number;
  step: number;
  formatValue?: (v: number) => string;
}

interface ToggleControl {
  type: 'toggle';
  label: string;
  field: keyof TransientUpdates;
}

interface RadioControl {
  type: 'radio';
  label: string;
  field: keyof TransientUpdates;
  options: string[];
  formatLabel?: (key: string) => string;
}

type ControlSpec = SliderControl | ToggleControl | RadioControl;

const CONTROL_SPECS: Record<string, ControlSpec> = {
  targetBundleSize: {
    type: 'slider',
    label: 'Target Bundle Size',
    field: 'targetBundleSize',
    min: 0.3,
    max: 6.0,
    step: 0.1,
    formatValue: (v: number) => `${v.toFixed(1)} MB`,
  },
  isModuleFederationEnabled: {
    type: 'toggle',
    label: 'Enable Module Federation',
    field: 'isModuleFederationEnabled',
  },
  isSloIncidentSimulated: {
    type: 'toggle',
    label: 'Simulate SLO Incident',
    field: 'isSloIncidentSimulated',
  },
  forceAiState: {
    type: 'radio',
    label: 'Force AI State',
    field: 'forceAiState',
    options: ['Patrol', 'Aggro', 'Flee'],
  },
  showNavMesh: {
    type: 'toggle',
    label: 'Show NavMesh',
    field: 'showNavMesh',
  },
  combatSystemPattern: {
    type: 'radio',
    label: 'Bullet Pattern',
    field: 'combatSystemPattern',
    options: Object.keys(COMBAT_SYSTEM_PATTERN_LABELS),
    formatLabel: (key: string) => COMBAT_SYSTEM_PATTERN_LABELS[key as CombatSystemPattern] ?? key,
  },
  combatSystemFireRate: {
    type: 'slider',
    label: 'Auto-fire Rate',
    field: 'combatSystemFireRate',
    min: 0.3,
    max: 6.0,
    step: 0.1,
    formatValue: (v: number) => `${v.toFixed(1)}/s`,
  },
  combatSystemBloom: {
    type: 'slider',
    label: 'Bloom Intensity',
    field: 'combatSystemBloom',
    min: 0.0,
    max: 3.0,
    step: 0.1,
    formatValue: (v: number) => v.toFixed(1),
  },
  combatSystemPoolSize: {
    type: 'slider',
    label: 'Pool Size',
    field: 'combatSystemPoolSize',
    min: 100,
    max: 5000,
    step: 100,
    formatValue: (v: number) => v.toString(),
  },
};

// --- Main Component ---
export function InspectorPanel() {
  return (
    <aside
      id="inspector"
      tabIndex={-1}
      className="flex h-full flex-col overflow-hidden bg-bg-panel"
      aria-label="Inspector panel"
    >
      <div className="flex h-[var(--toolbar-height)] items-center border-b-[3px] border-header-ink bg-header-bg px-3">
        <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-header-ink">
          Inspector
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-[var(--panel-padding)]">
        <InspectorPanelContent />
      </div>
    </aside>
  );
}

/**
 * InspectorPanelContent — the reusable inner content of the inspector.
 * Used by both the desktop InspectorPanel and the mobile MobileBottomSheet.
 */
export function InspectorPanelContent() {
  const { activeFileId, setTransientState } = useEngineStore(
    useShallow((s) => ({
      activeFileId: s.activeFileId,
      setTransientState: s.setTransientState,
    }))
  );

  const entry = activeFileId ? RESUME_DATA[activeFileId] : null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus management: when a file is selected, move focus to Inspector heading
  useEffect(() => {
    if (activeFileId && headingRef.current) {
      headingRef.current.focus();
    }
  }, [activeFileId]);

  if (!entry) return <WelcomeView />;

  return (
    <FileEntryView
      entry={entry}
      headingRef={headingRef}
      setTransientState={setTransientState}
    />
  );
}

// --- Welcome View (no file selected) ---
function WelcomeView() {
  return (
    <div className="flex min-h-full flex-col items-center gap-4 py-6 text-center">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-black uppercase tracking-[-0.025em] text-text-primary">
          {CONTACT_INFO.name}
        </h1>
        <p className="border-[3px] border-border bg-bg-editor px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.1em] text-text-primary shadow-[4px_4px_0_#161310]">
          {CONTACT_INFO.title}
        </p>
      </div>
      <p className="max-w-sm border-[3px] border-border bg-surface p-3 font-ui text-[15px] font-medium leading-relaxed text-text-primary shadow-[6px_6px_0_#161310]">
        {SUMMARY}
      </p>
      <div className="mt-4 space-y-1 text-left font-mono text-xs text-text-muted">
        <p>📍 {CONTACT_INFO.location}</p>
        <p>
          📧 <a href={`mailto:${CONTACT_INFO.email}`} className="text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-status hover:text-status-ink">{CONTACT_INFO.email}</a>
        </p>
        <p>
          🔗 <a href={`https://${CONTACT_INFO.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-status hover:text-status-ink">{CONTACT_INFO.linkedin}</a>
        </p>
        <p>
          🐙 <a href={CONTACT_INFO.github} target="_blank" rel="noopener noreferrer" className="text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-status hover:text-status-ink">{CONTACT_INFO.github.replace('https://', '')}</a>
        </p>
      </div>
      <div className="mt-4">
        <p className="font-ui text-xs text-text-muted">
          Select a file from the Hierarchy to inspect.
        </p>
      </div>
      <div className="mt-4 w-full">
        <p className="mb-2 inline-block border-2 border-border bg-bg-editor px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-text-primary">
          Education
        </p>
        <div className="space-y-2">
          {EDUCATION.map((edu) => (
            <div key={edu.school} className="border-[3px] border-border bg-bg-editor p-3 shadow-[4px_4px_0_#161310]">
              <p className="font-display text-xl font-black tracking-[-0.02em] text-text-primary">
                {edu.school}
              </p>
              <p className="font-mono text-xs text-text-muted">
                {edu.degree}
                {edu.gpa ? ` — GPA: ${edu.gpa}` : ''} — {edu.graduationDate}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 w-full">
        <p className="mb-2 inline-block border-2 border-border bg-bg-editor px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-text-primary">
          Core Skills
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SKILLS.map((skill) => (
            <span
              key={skill}
              className="border-2 border-border bg-bg-editor px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-text-primary"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- CombatSystem Live Region (screen reader announcements) ---
function CombatSystemLiveRegion() {
  const pattern = useEngineStore(
    (s) => s.combatSystemPattern
  ) as CombatSystemPattern;
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {`Bullet pattern: ${COMBAT_SYSTEM_PATTERN_LABELS[pattern]}`}
    </div>
  );
}

// --- File Entry View (with resume content + controls) ---
interface FileEntryViewProps {
  entry: ProjectEntry;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  setTransientState: (updates: TransientUpdates) => void;
}

function FileEntryView({
  entry,
  headingRef,
  setTransientState,
}: FileEntryViewProps) {
  const prefersReduced = useReducedMotion();
  const disableCombatControls = (entry.fileId === 'combat_system' || entry.fileId === 'r3f-projectiles') && prefersReduced;

  const animate = !prefersReduced;
  const filePath = filePathFor(entry);
  const eyebrow = useScrambledText(filePath, animate);
  // Only hide the label from assistive tech while it is still garbled.
  const isScrambling = eyebrow !== filePath;
  const showsTimeline = EXPERIENCE_FILE_IDS.includes(entry.fileId);

  return (
    <div className="space-y-5">
      {/* 02_Experience: the level progression sits above the entry itself.
          Folders in the Hierarchy only expand/collapse — they never become the
          active file — so the timeline is mounted on the experience entries. */}
      {showsTimeline && <LevelTimeline />}

      {/* Header */}
      <div className="border-[3px] border-border bg-bg-editor p-4 shadow-[6px_6px_0_#161310]">
        {/* Eyebrow — the file's Hierarchy path */}
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-interactive">
          <span className="sr-only">File path: </span>
          <span aria-hidden={isScrambling ? 'true' : undefined}>{eyebrow}</span>
          {isScrambling && <span className="sr-only">{filePath}</span>}
        </p>

        {/* Headline — the point, not the job title */}
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 font-display text-[28px] font-black leading-[1.05] tracking-[-0.03em] text-text-primary outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-interactive"
        >
          {entry.headline || entry.title}
        </h2>

        {/* One-sentence summary */}
        {entry.summary && (
          <p className="mt-2 font-ui text-[15px] font-medium leading-relaxed text-text-primary">
            {entry.summary}
          </p>
        )}

        {/* Metadata row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs uppercase tracking-[0.08em] text-text-muted">
          {entry.headline && (
            <h3 className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-text-primary">
              {entry.title}
            </h3>
          )}
          {entry.headline && entry.company && <span aria-hidden="true">/</span>}
          {entry.company && <span className="text-text-accent">{entry.company}</span>}
          {entry.dates && (entry.company || entry.headline) && (
            <span aria-hidden="true">/</span>
          )}
          {entry.dates && <span>{entry.dates}</span>}
          <span className="border-2 border-border bg-bg-editor px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-text-primary">
            {entry.type}
          </span>
        </div>
      </div>

      {/* Tech Stack / Skills */}
      {entry.skills && entry.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.skills.map((skill) => (
            <span
              key={skill}
              className="border-2 border-border bg-bg-editor px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-text-primary"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Bullets — compile in one after another, from a visible state */}
      <LazyMotion features={domAnimation}>
        <ul className="space-y-3" key={entry.fileId}>
          {entry.bullets.map((bullet, i) => {
            const content = (
              <>
                <span className="mt-1.5 h-3 w-3 shrink-0 border-2 border-border bg-ink shadow-[2px_2px_0_#161310]" />
                <span className="break-words">
                  <LinkifiedText text={bullet} />
                </span>
              </>
            );
            const className =
              'flex gap-3 border-b-2 border-border pb-3 font-ui text-[15px] font-medium leading-relaxed text-text-primary last:border-b-0';

            if (!animate) {
              return (
                <li key={`${entry.fileId}-bullet-${i}`} className={className}>
                  {content}
                </li>
              );
            }

            return (
              <m.li
                key={`${entry.fileId}-bullet-${i}`}
                className={className}
                // Never from opacity 0 — the text is legible on first paint.
                initial={{ opacity: 0.15, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: BULLET_DURATION_S,
                  delay: Math.min(i * BULLET_STAGGER_S, BULLET_MAX_DELAY_S),
                  ease: 'easeOut',
                }}
              >
                {content}
              </m.li>
            );
          })}
        </ul>
      </LazyMotion>

      {/* Interactive Controls */}
      {entry.controls && entry.controls.length > 0 && (
        <div className="mt-6 border-[3px] border-border bg-bg-editor p-3 shadow-[6px_6px_0_#161310]">
          <p className="mb-3 inline-block border-2 border-border bg-bg-editor px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-text-primary">
            Interactive Controls
          </p>
          {disableCombatControls && (
            <div className="mb-4 border-[3px] border-border bg-bg-panel p-2 text-xs font-semibold text-text-primary">
              <span className="mr-1.5 inline-block border-2 border-border bg-status px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-status-ink">
                Reduced Motion Active
              </span>
              The bullet system has been automatically paused and capped to 200 instances for accessibility. Controls are disabled.
            </div>
          )}
          <div className="space-y-4">
            {entry.controls.map((controlId) => {
              const spec = CONTROL_SPECS[controlId];
              if (!spec) return null;

              switch (spec.type) {
                case 'slider':
                  return (
                    <SliderControl
                      key={controlId}
                      spec={spec}
                      disabled={disableCombatControls}
                      setTransientState={setTransientState}
                    />
                  );
                case 'toggle':
                  return (
                    <ToggleControl
                      key={controlId}
                      spec={spec}
                      disabled={disableCombatControls}
                      setTransientState={setTransientState}
                    />
                  );
                case 'radio':
                  return (
                    <RadioGroupControl
                      key={controlId}
                      spec={spec}
                      disabled={disableCombatControls}
                      setTransientState={setTransientState}
                    />
                  );
              }
            })}
          </div>
        </div>
      )}

      {/* aria-live region for WebGL scene changes */}
      {entry.controls && entry.controls.includes('combatSystemPattern') && (
        <CombatSystemLiveRegion />
      )}
    </div>
  );
}

// --- Slider Control (IBM Bundle Size) ---
function SliderControl({
  spec,
  setTransientState,
  disabled,
}: {
  spec: SliderControl;
  setTransientState: (u: TransientUpdates) => void;
  disabled?: boolean;
}) {
  const value = useEngineStore(
    (s) => s[spec.field as keyof typeof s]
  ) as number;
  const sliderId = useId();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={sliderId}
          className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-text-muted"
        >
          {spec.label}
        </label>
        <span className="border-2 border-border bg-interactive px-1.5 py-0.5 font-mono text-xs font-bold text-interactive-ink">
          {spec.formatValue ? spec.formatValue(value) : value}
        </span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          setTransientState({
            [spec.field]: parseFloat(e.target.value),
          } as TransientUpdates)
        }
        className={`w-full accent-interactive ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={value}
        aria-valuetext={spec.formatValue ? spec.formatValue(value) : `${value}`}
      />
      <div className="flex justify-between font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
        <span>
          {spec.formatValue ? spec.formatValue(spec.min) : spec.min}
        </span>
        <span>
          {spec.formatValue ? spec.formatValue(spec.max) : spec.max}
        </span>
      </div>
    </div>
  );
}

// --- Toggle Control (Indeed toggles, HammerBall NavMesh) ---
function ToggleControl({
  spec,
  setTransientState,
  disabled,
}: {
  spec: ToggleControl;
  setTransientState: (u: TransientUpdates) => void;
  disabled?: boolean;
}) {
  const value = useEngineStore(
    (s) => s[spec.field as keyof typeof s]
  ) as boolean;
  const checkboxId = useId();

  return (
    <div className="flex items-center gap-3 min-h-[44px]">
      <input
        id={checkboxId}
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) =>
          setTransientState({
            [spec.field]: e.target.checked,
          } as TransientUpdates)
        }
        className={`h-5 w-5 border-2 border-border bg-bg-panel text-interactive accent-interactive ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      />
      <label
        htmlFor={checkboxId}
        className={`font-mono text-xs font-bold uppercase tracking-[0.08em] select-none ${disabled ? 'text-text-muted/50 cursor-not-allowed' : 'text-text-muted cursor-pointer'}`}
      >
        {spec.label}
      </label>
    </div>
  );
}

// --- Radio Group Control (HammerBall AI State) ---
function RadioGroupControl({
  spec,
  setTransientState,
  disabled,
}: {
  spec: RadioControl;
  setTransientState: (u: TransientUpdates) => void;
  disabled?: boolean;
}) {
  const value = useEngineStore(
    (s) => s[spec.field as keyof typeof s]
  ) as string;
  const groupId = useId();

  return (
    <fieldset className="space-y-2">
      <legend className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-text-muted">{spec.label}</legend>
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={spec.label}>
        {spec.options.map((option) => {
          const radioId = `${groupId}-${option}`;
          return (
            <div key={option} className="flex items-center gap-2 min-h-[44px]">
              <input
                id={radioId}
                type="radio"
                name={`${groupId}-${spec.field}`}
                value={option}
                checked={value === option}
                disabled={disabled}
                onChange={() =>
                  setTransientState({
                    [spec.field]: option,
                  } as TransientUpdates)
                }
                aria-label={spec.formatLabel ? spec.formatLabel(option) : option}
                className={`h-5 w-5 border-2 border-border bg-bg-panel text-interactive accent-interactive ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              />
              <label
                htmlFor={radioId}
                className={`font-mono text-xs select-none ${
                  disabled ? 'text-text-muted/50 cursor-not-allowed' :
                  value === option ? 'bg-interactive px-1 text-interactive-ink cursor-pointer' : 'text-text-muted cursor-pointer'
                }`}
              >
                {spec.formatLabel ? spec.formatLabel(option) : option}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
