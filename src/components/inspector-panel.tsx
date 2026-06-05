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
      <div className="flex h-[var(--toolbar-height)] items-center border-b border-border px-3">
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
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
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-2">
        <h1 className="font-ui text-xl font-semibold text-text-primary">
          {CONTACT_INFO.name}
        </h1>
        <p className="font-ui text-sm text-text-accent">{CONTACT_INFO.title}</p>
      </div>
      <p className="max-w-sm font-ui text-sm leading-relaxed text-text-muted">
        {SUMMARY}
      </p>
      <div className="mt-4 space-y-1 text-left font-mono text-xs text-text-muted">
        <p>📍 {CONTACT_INFO.location}</p>
        <p>📧 {CONTACT_INFO.email}</p>
        <p>🔗 {CONTACT_INFO.linkedin}</p>
      </div>
      <div className="mt-4">
        <p className="font-ui text-xs text-text-muted">
          Select a file from the Hierarchy to inspect.
        </p>
      </div>
      <div className="mt-4 w-full">
        <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
          Education
        </p>
        <div className="rounded-md border border-border bg-bg-editor p-3">
          <p className="font-ui text-sm text-text-primary">
            {EDUCATION.school}
          </p>
          <p className="font-mono text-xs text-text-muted">
            {EDUCATION.degree} — GPA: {EDUCATION.gpa} —{' '}
            {EDUCATION.graduationDate}
          </p>
        </div>
      </div>
      <div className="mt-4 w-full">
        <p className="mb-2 font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
          Core Skills
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SKILLS.map((skill) => (
            <span
              key={skill}
              className="rounded-sm border border-border bg-bg-editor px-2 py-0.5 font-mono text-[11px] text-text-muted"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>
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
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-ui text-lg font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-text-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-panel rounded-sm"
        >
          {entry.title}
        </h2>
        {entry.company && (
          <p className="font-ui text-sm text-text-accent">{entry.company}</p>
        )}
        {entry.dates && (
          <p className="font-mono text-xs text-text-muted">{entry.dates}</p>
        )}
        <span
          className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${
            entry.type === 'work'
              ? 'bg-text-accent/10 text-text-accent'
              : entry.type === 'project'
                ? 'bg-text-green/10 text-text-green'
                : entry.type === 'skill'
                  ? 'bg-text-peach/10 text-text-peach'
                  : entry.type === 'contact'
                    ? 'bg-text-yellow/10 text-text-yellow'
                    : 'bg-text-muted/10 text-text-muted'
          }`}
        >
          {entry.type}
        </span>
      </div>

      {/* Bullets */}
      <ul className="space-y-3">
        {entry.bullets.map((bullet, i) => (
          <li
            key={`${entry.fileId}-bullet-${i}`}
            className="flex gap-2 font-ui text-sm leading-relaxed text-text-primary"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-text-accent" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {/* Interactive Controls */}
      {entry.controls && entry.controls.length > 0 && (
        <div className="mt-6 rounded-md border border-border/50 bg-bg-editor p-3">
          <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Interactive Controls
          </p>
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
                      setTransientState={setTransientState}
                    />
                  );
                case 'toggle':
                  return (
                    <ToggleControl
                      key={controlId}
                      spec={spec}
                      setTransientState={setTransientState}
                    />
                  );
                case 'radio':
                  return (
                    <RadioGroupControl
                      key={controlId}
                      spec={spec}
                      setTransientState={setTransientState}
                    />
                  );
              }
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Slider Control (IBM Bundle Size) ---
function SliderControl({
  spec,
  setTransientState,
}: {
  spec: SliderControl;
  setTransientState: (u: TransientUpdates) => void;
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
          className="font-mono text-xs text-text-muted"
        >
          {spec.label}
        </label>
        <span className="font-mono text-xs font-medium text-text-accent">
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
        onChange={(e) =>
          setTransientState({
            [spec.field]: parseFloat(e.target.value),
          } as TransientUpdates)
        }
        className="w-full accent-text-accent"
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={value}
        aria-valuetext={spec.formatValue ? spec.formatValue(value) : `${value}`}
      />
      <div className="flex justify-between font-mono text-[10px] text-text-muted">
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
}: {
  spec: ToggleControl;
  setTransientState: (u: TransientUpdates) => void;
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
        onChange={(e) =>
          setTransientState({
            [spec.field]: e.target.checked,
          } as TransientUpdates)
        }
        className="h-4 w-4 rounded border-border bg-bg-panel text-text-accent accent-text-accent cursor-pointer"
      />
      <label
        htmlFor={checkboxId}
        className="font-mono text-xs text-text-muted cursor-pointer select-none"
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
}: {
  spec: RadioControl;
  setTransientState: (u: TransientUpdates) => void;
}) {
  const value = useEngineStore(
    (s) => s[spec.field as keyof typeof s]
  ) as string;
  const groupId = useId();

  return (
    <fieldset className="space-y-2">
      <legend className="font-mono text-xs text-text-muted">{spec.label}</legend>
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
                onChange={() =>
                  setTransientState({
                    [spec.field]: option,
                  } as TransientUpdates)
                }
                className="h-4 w-4 border-border bg-bg-panel text-text-accent accent-text-accent cursor-pointer"
              />
              <label
                htmlFor={radioId}
                className={`font-mono text-xs cursor-pointer select-none ${
                  value === option ? 'text-text-accent' : 'text-text-muted'
                }`}
              >
                {option}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
