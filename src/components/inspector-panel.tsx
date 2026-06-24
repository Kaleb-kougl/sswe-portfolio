'use client';

import { useRef, useEffect, useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEngineStore, type TransientUpdates } from '@/store/useEngineStore';
import {
  RESUME_DATA,
  CONTACT_INFO,
  SUMMARY,
  EDUCATION,
  SKILLS,
  type ProjectEntry,
} from '@/data/resumeData';
import { COMBAT_SYSTEM_PATTERN_LABELS, type CombatSystemPattern } from '@/components/3d/scenes/combat-system-types';
import { useReducedMotion } from '@/hooks/useReducedMotion';

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
            <a key={i} href={`mailto:${part}`} className="font-semibold text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-lime hover:text-ink">
              {part}
            </a>
          );
        } else if (part.match(/^(https?:\/\/|linkedin\.com)/)) {
          const href = part.startsWith('http') ? part : `https://${part}`;
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-lime hover:text-ink">
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
      <div className="flex h-[var(--toolbar-height)] items-center border-b-[3px] border-border bg-cobalt px-3">
        <span className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-white">
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
        <p className="border-[3px] border-border bg-lime px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.1em] text-ink shadow-[4px_4px_0_#161310]">
          {CONTACT_INFO.title}
        </p>
      </div>
      <p className="max-w-sm border-[3px] border-border bg-surface p-3 font-ui text-[15px] font-medium leading-relaxed text-text-primary shadow-[6px_6px_0_#161310]">
        {SUMMARY}
      </p>
      <div className="mt-4 space-y-1 text-left font-mono text-xs text-text-muted">
        <p>📍 {CONTACT_INFO.location}</p>
        <p>
          📧 <a href={`mailto:${CONTACT_INFO.email}`} className="text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-lime hover:text-ink">{CONTACT_INFO.email}</a>
        </p>
        <p>
          🔗 <a href={`https://${CONTACT_INFO.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-lime hover:text-ink">{CONTACT_INFO.linkedin}</a>
        </p>
        <p>
          🐙 <a href={CONTACT_INFO.github} target="_blank" rel="noopener noreferrer" className="text-text-accent underline decoration-[3px] underline-offset-4 hover:bg-lime hover:text-ink">{CONTACT_INFO.github.replace('https://', '')}</a>
        </p>
      </div>
      <div className="mt-4">
        <p className="font-ui text-xs text-text-muted">
          Select a file from the Hierarchy to inspect.
        </p>
      </div>
      <div className="mt-4 w-full">
        <p className="mb-2 inline-block border-2 border-border bg-tangerine px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white">
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
        <p className="mb-2 inline-block border-2 border-border bg-cobalt px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-white">
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="border-[3px] border-border bg-bg-editor p-4 shadow-[6px_6px_0_#161310]">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-2xl font-black uppercase tracking-[-0.025em] text-text-primary outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-cobalt"
        >
          {entry.title}
        </h2>
        {entry.company && (
          <p className="mt-1 font-ui text-[15px] font-semibold text-text-accent">{entry.company}</p>
        )}
        {entry.dates && (
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.08em] text-text-muted">{entry.dates}</p>
        )}
        <span
          className={`mt-3 inline-block border-2 border-border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${
            entry.type === 'work'
              ? 'bg-cobalt text-white'
              : entry.type === 'project'
                ? 'bg-lime text-ink'
                : entry.type === 'skill'
                  ? 'bg-tangerine text-white'
                  : entry.type === 'contact'
                    ? 'bg-lime text-ink'
                    : 'bg-bg-editor text-text-primary'
          }`}
        >
          {entry.type}
        </span>
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

      {/* Bullets */}
      <ul className="space-y-3">
        {entry.bullets.map((bullet, i) => (
          <li
            key={`${entry.fileId}-bullet-${i}`}
            className="flex gap-3 border-b-2 border-border pb-3 font-ui text-[15px] font-medium leading-relaxed text-text-primary last:border-b-0"
          >
            <span className="mt-1.5 h-3 w-3 shrink-0 border-2 border-border bg-tangerine shadow-[2px_2px_0_#161310]" />
            <span className="break-words">
              <LinkifiedText text={bullet} />
            </span>
          </li>
        ))}
      </ul>

      {/* Interactive Controls */}
      {entry.controls && entry.controls.length > 0 && (
        <div className="mt-6 border-[3px] border-border bg-bg-editor p-3 shadow-[6px_6px_0_#161310]">
          <p className="mb-3 inline-block border-2 border-border bg-lime px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink">
            Interactive Controls
          </p>
          {disableCombatControls && (
            <div className="mb-4 border-[3px] border-border bg-lime p-2 text-xs font-semibold text-ink">
              <strong>Reduced Motion Active:</strong> The bullet system has been automatically paused and capped to 200 instances for accessibility. Controls are disabled.
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
        <span className="border-2 border-border bg-cobalt px-1.5 py-0.5 font-mono text-xs font-bold text-white">
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
        className={`w-full accent-cobalt ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
        className={`h-5 w-5 border-2 border-border bg-bg-panel text-cobalt accent-cobalt ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
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
                className={`h-5 w-5 border-2 border-border bg-bg-panel text-cobalt accent-cobalt ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              />
              <label
                htmlFor={radioId}
                className={`font-mono text-xs select-none ${
                  disabled ? 'text-text-muted/50 cursor-not-allowed' :
                  value === option ? 'bg-lime px-1 text-ink cursor-pointer' : 'text-text-muted cursor-pointer'
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
