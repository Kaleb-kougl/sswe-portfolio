'use client';

import { useEffect, useRef, useState } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import * as m from 'motion/react-m';
import { FILE_TREE } from '@/data/fileTree';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { RESUME_DATA, type ProjectEntry } from '@/data/resumeData';
import { useEngineStore } from '@/store/useEngineStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// --- Levels, derived from the Hierarchy file tree ---------------------------
// The 02_Experience children are already named `Level_1_...` → `Level_4_...`,
// so the ordering and the LEVEL_N labels come straight from the tree instead
// of being duplicated here.

export interface TimelineLevel {
  fileId: string;
  /** e.g. `LEVEL_1` */
  levelLabel: string;
  level: number;
  /** Role token taken from the Hierarchy file name, e.g. `Staff_SWE`. */
  roleToken: string;
}

/**
 * Turns `Level_3_IBM_Staff_SWE.tsx` into `Staff_SWE` — the role as the
 * Hierarchy already spells it, minus the level prefix, the company token and
 * the extension. Falls back to whatever is left if the company can't be
 * matched, so this never returns an empty label.
 */
function roleTokenFrom(label: string, company: string): string {
  const stem = label.replace(/^Level_\d+_/, '').replace(/\.[^.]+$/, '');
  const parts = stem.split('_');
  const companyKey = company.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (parts.length > 1 && companyKey.startsWith(parts[0].toLowerCase())) {
    return parts.slice(1).join('_');
  }
  return stem;
}

function buildLevels(): TimelineLevel[] {
  const folder = FILE_TREE.find((node) => node.id === 'experience');
  if (!folder?.children) return [];

  return folder.children
    .map((child) => {
      const match = /^Level_(\d+)_/.exec(child.label);
      if (!match) return null;
      const level = Number(match[1]);
      return {
        fileId: child.id,
        level,
        levelLabel: `LEVEL_${level}`,
        roleToken: roleTokenFrom(child.label, RESUME_DATA[child.id]?.company ?? ''),
      } satisfies TimelineLevel;
    })
    .filter((v): v is TimelineLevel => v !== null)
    .sort((a, b) => a.level - b.level);
}

export const TIMELINE_LEVELS: TimelineLevel[] = buildLevels();

/** File ids that should show the level timeline above their entry. */
export const EXPERIENCE_FILE_IDS: string[] = TIMELINE_LEVELS.map((l) => l.fileId);

/**
 * The "current" level is the most recent one still in progress (its dates say
 * Present). Falls back to the highest level if nothing is marked ongoing.
 */
function findCurrentIndex(levels: TimelineLevel[]): number {
  for (let i = levels.length - 1; i >= 0; i--) {
    const entry = RESUME_DATA[levels[i].fileId];
    if (entry?.dates && /present/i.test(entry.dates)) return i;
  }
  return levels.length - 1;
}

// --- In-view detection (drives the XP bar) ----------------------------------
function useInViewOnce<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // jsdom / older browsers: treat as immediately in view rather than never.
    if (typeof IntersectionObserver === 'undefined') {
      const timer = setTimeout(() => setInView(true), 0);
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, inView];
}

// --- Component --------------------------------------------------------------
export function LevelTimeline() {
  const activeFileId = useEngineStore((s) => s.activeFileId);
  const setActiveFile = useEngineStore((s) => s.setActiveFile);
  const prefersReduced = useReducedMotion();
  const [rootRef, inView] = useInViewOnce<HTMLElement>();

  const levels = TIMELINE_LEVELS;
  if (levels.length === 0) return null;

  const currentIndex = findCurrentIndex(levels);
  const xpPercent = Math.round(((currentIndex + 1) / levels.length) * 100);
  // Never animates from hidden — the track is always drawn, only the fill grows.
  const fillWidth = prefersReduced || inView ? `${xpPercent}%` : '0%';

  return (
    <LazyMotion features={domAnimation}>
      <section
        ref={rootRef}
        aria-label="Career level progression"
        className="@container mb-6 border-[3px] border-border bg-bg-editor p-3 shadow-[6px_6px_0_#161310]"
      >
        <SectionLabel>Career Progression</SectionLabel>

        {/* XP bar */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
            <span>XP</span>
            <span>
              {levels[currentIndex]?.levelLabel} / LEVEL_{levels.length}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Career XP"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={xpPercent}
            aria-valuetext={`${xpPercent} percent`}
            className="mt-1.5 h-3 w-full border-2 border-border bg-bg-panel"
          >
            {prefersReduced ? (
              <div className="h-full bg-ink" style={{ width: fillWidth }} />
            ) : (
              <m.div
                className="h-full bg-ink"
                initial={{ width: '0%' }}
                animate={{ width: fillWidth }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            )}
          </div>
        </div>

        {/* Levels */}
        <div className="relative mt-4">
          {/* Center line — left rail under 460px, centered above it */}
          <span
            aria-hidden="true"
            className="absolute bottom-2 left-[9px] top-2 w-[3px] -translate-x-1/2 bg-border @[460px]:left-1/2"
          />
          <ol className="space-y-3">
            {levels.map((level, i) => (
              <LevelCard
                key={level.fileId}
                level={level}
                entry={RESUME_DATA[level.fileId]}
                isLeft={i % 2 === 0}
                isCurrent={i === currentIndex}
                isCompleted={i < currentIndex}
                isSelected={activeFileId === level.fileId}
                onSelect={() =>
                  setActiveFile(level.fileId, FILE_LOG_MAP[level.fileId])
                }
              />
            ))}
          </ol>
        </div>
      </section>
    </LazyMotion>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-block border-2 border-border bg-bg-editor px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-text-primary">
      {children}
    </p>
  );
}

interface LevelCardProps {
  level: TimelineLevel;
  entry?: ProjectEntry;
  isLeft: boolean;
  isCurrent: boolean;
  isCompleted: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function LevelCard({
  level,
  entry,
  isLeft,
  isCurrent,
  isCompleted,
  isSelected,
  onSelect,
}: LevelCardProps) {
  if (!entry) return null;

  return (
    <li className="relative pl-10 @[460px]:pl-0">
      {/* Node on the line */}
      <span
        aria-hidden="true"
        className={`absolute left-[9px] top-4 h-4 w-4 -translate-x-1/2 border-[3px] border-border @[460px]:left-1/2 ${
          isCurrent
            ? 'bg-status outline outline-[3px] outline-offset-[3px] outline-border'
            : isCompleted
              ? 'bg-ink'
              : 'bg-bg-panel'
        }`}
      />

      <div
        className={`@[460px]:w-[calc(50%-1.75rem)] ${isLeft ? '' : '@[460px]:ml-auto'}`}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-current={isSelected ? 'true' : undefined}
          className={`block min-h-[44px] w-full border-[3px] border-border bg-bg-panel p-2.5 text-left transition-transform ${
            isSelected
              ? 'translate-x-[2px] translate-y-[2px] shadow-none outline outline-[3px] outline-offset-[3px] outline-interactive'
              : 'shadow-[4px_4px_0_#161310] hover:-translate-x-[1px] hover:-translate-y-[1px]'
          } focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-interactive`}
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="border-2 border-border bg-bg-editor px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-primary">
              {level.levelLabel}
            </span>
            {isCurrent && (
              <span className="border-2 border-border bg-status px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-status-ink">
                Current
              </span>
            )}
          </span>

          {/* Company + role, spelled the way the Hierarchy spells them, so the
              card reads as a shortcut to the file rather than a second copy of
              the entry header. */}
          <span className="mt-2 block font-display text-lg font-black leading-tight tracking-[-0.02em] text-text-primary">
            {entry.company}
            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-text-muted">
              {' / '}
              {level.roleToken}
            </span>
          </span>
          <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
            {entry.dates}
          </span>

          {entry.result && (
            <span className="mt-2 block border-t-2 border-border pt-2 font-ui text-[13px] font-medium leading-snug text-text-primary">
              {entry.result}
            </span>
          )}
        </button>
      </div>
    </li>
  );
}
