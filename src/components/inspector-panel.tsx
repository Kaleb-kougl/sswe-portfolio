'use client';

import { useEngineStore } from '@/store/useEngineStore';
import { RESUME_DATA, CONTACT_INFO, SUMMARY, EDUCATION, SKILLS } from '@/data/resumeData';

export function InspectorPanel() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const entry = activeFileId ? RESUME_DATA[activeFileId] : null;

  return (
    <aside
      id="inspector"
      className="flex h-full flex-col overflow-hidden bg-bg-panel"
      aria-label="Inspector panel"
    >
      <div className="flex h-[var(--toolbar-height)] items-center border-b border-border px-3">
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
          Inspector
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-[var(--panel-padding)]">
        {!entry ? (
          <WelcomeView />
        ) : (
          <FileEntryView entry={entry} />
        )}
      </div>
    </aside>
  );
}

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
          <p className="font-ui text-sm text-text-primary">{EDUCATION.school}</p>
          <p className="font-mono text-xs text-text-muted">
            {EDUCATION.degree} — GPA: {EDUCATION.gpa} — {EDUCATION.graduationDate}
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

interface FileEntryViewProps {
  entry: NonNullable<ReturnType<typeof getEntry>>;
}

function getEntry(id: string) {
  return RESUME_DATA[id] ?? null;
}

function FileEntryView({ entry }: { entry: (typeof RESUME_DATA)[string] }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="font-ui text-lg font-semibold text-text-primary">
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

      {/* Controls placeholder — Phase 2 */}
      {entry.controls && entry.controls.length > 0 && (
        <div className="mt-6 rounded-md border border-border/50 bg-bg-editor p-3">
          <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Interactive Controls
          </p>
          <p className="font-mono text-xs text-text-muted italic">
            Controls will be available in Phase 2.
          </p>
        </div>
      )}
    </div>
  );
}
