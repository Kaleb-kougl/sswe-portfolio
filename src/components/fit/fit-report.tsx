import { ArrowUpRight } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

import { CORPUS, type Evidence } from '@/data/corpus';
import { SITE_URL } from '@/data/site';
import type { FitReport, Requirement, Verdict } from '@/lib/fit/contract';
import { entryLabel, evidenceLabel } from '@/lib/fit/labels';
import { coverageLine, NO_COVERAGE_LINE, VERDICT_LABELS } from '@/lib/fit/markdown';
import { SCAN_DISCLAIMER } from '@/lib/fit/scan';

/* ---------------------------------------------------------------------------
   FitReportView

   Renders a `FitReport` (scan or model mode). Everything that came from the
   pasted JD (role, requirement text) is rendered as React text, never as
   HTML, so a hostile JD can't inject markup. Notes are templates from
   `src/lib/fit/judge.ts`; evidence comes from `CORPUS` by id.

   Imported only by the /fit client island, so it adds nothing to the homepage.
   --------------------------------------------------------------------------- */

const EVIDENCE_BY_ID: ReadonlyMap<string, Evidence> = new Map(CORPUS.evidence.map((e) => [e.id, e]));

/**
 * Work-history records are sourced to this site's own sections
 * (`${SITE_URL}/#career`). Rendered relative, so a local or preview build
 * links to itself rather than jumping to production, and without the
 * new-tab treatment, since they aren't external.
 */
export function evidenceHref(href: string): { href: string; external: boolean } {
  if (href.startsWith(`${SITE_URL}/`)) return { href: href.slice(SITE_URL.length), external: false };
  return { href, external: true };
}

/** Text label first, glyph second: the verdict never rests on color alone. */
const VERDICT_STYLE: Readonly<Record<Verdict, { className: string; glyph: string }>> = {
  strong: { className: 'border-transparent bg-badge-lime text-badge-lime-ink', glyph: '●' },
  partial: { className: 'border-transparent bg-badge-blue text-badge-blue-ink', glyph: '◐' },
  gap: { className: 'border-control bg-surface text-ink', glyph: '○' },
  not_assessed: { className: 'border-hairline bg-panel-subtle text-muted', glyph: '–' },
};

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLE[verdict];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1 font-mono text-[11px] font-bold uppercase leading-none tracking-[0.08em] ${style.className}`}
    >
      <span aria-hidden="true">{style.glyph}</span>
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const { href, external } = evidenceHref(evidence.source.href);
  return (
    <li>
      <a
        href={href}
        data-evidence-id={evidence.id}
        title={`${evidence.claim} Source: ${evidence.source.label}`}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-pill border border-control bg-surface px-3 py-1.5 text-left font-ui text-[13px] font-semibold leading-snug text-ink shadow-hairline transition-colors hover:border-ink hover:bg-panel"
      >
        <span>
          {evidenceLabel(evidence)}
          <span className="font-medium text-muted"> · {entryLabel(evidence.entry)}</span>
        </span>
        {external ? (
          <>
            <ArrowUpRight size={14} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
            <span className="sr-only"> (opens in a new tab)</span>
          </>
        ) : null}
      </a>
    </li>
  );
}

function RequirementRow({ row }: { row: Requirement }) {
  const evidence = row.evidenceIds.map((id) => EVIDENCE_BY_ID.get(id)).filter((e): e is Evidence => !!e);
  return (
    <li data-verdict={row.verdict} className="rounded-md border border-hairline bg-surface p-4 shadow-hairline sm:p-5">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:gap-3">
        <VerdictBadge verdict={row.verdict} />
        <p className="min-w-0 font-ui text-[15px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
          {row.text}
        </p>
      </div>
      {row.note ? <p className="mt-2 font-ui text-sm leading-relaxed text-body">{row.note}</p> : null}
      {evidence.length > 0 ? (
        <ul aria-label="Evidence" className="mt-3 flex flex-wrap gap-2">
          {evidence.map((e) => (
            <EvidenceChip key={e.id} evidence={e} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface Group {
  key: string;
  title: string;
  rows: Requirement[];
}

/**
 * Must-have / Nice-to-have / Not assessed when the report knows priorities
 * (model mode, or a scan that found a must-have under a requirements header
 * or a "required" cue; coverage can still be null then, when too few are
 * assessable). A scan that found none defaults every row to `nice`
 * (`defaultDecision`), which says nothing, so it groups by what was found
 * instead of calling everything a nice-to-have. (markdown.ts uses priority
 * headings in both modes; the two differ only for such a scan.)
 */
export function groupRows(report: Pick<FitReport, 'mode' | 'coverage' | 'requirements'>): Group[] {
  const rows = report.requirements;
  const assessed = rows.filter((r) => r.verdict !== 'not_assessed');
  const notAssessed = rows.filter((r) => r.verdict === 'not_assessed');
  const hasPriorities = report.mode === 'model' || rows.some((r) => r.priority === 'must');
  const groups: Group[] = hasPriorities
    ? [
        { key: 'must', title: 'Must-have', rows: assessed.filter((r) => r.priority === 'must') },
        { key: 'nice', title: 'Nice-to-have', rows: assessed.filter((r) => r.priority === 'nice') },
        // A row whose priority code couldn't tell (neither must nor nice).
        {
          key: 'other',
          title: 'Other requirements',
          rows: assessed.filter((r) => r.priority !== 'must' && r.priority !== 'nice'),
        },
        { key: 'not-assessed', title: 'Not assessed', rows: notAssessed },
      ]
    : [
        { key: 'found', title: 'In my work', rows: assessed.filter((r) => r.verdict !== 'gap') },
        { key: 'gaps', title: 'Not in my work yet', rows: assessed.filter((r) => r.verdict === 'gap') },
        { key: 'not-assessed', title: 'Not assessed', rows: notAssessed },
      ];
  return groups.filter((g) => g.rows.length > 0);
}

export function FitReportView({
  report,
  headingId,
  pending = false,
  actions,
  level = 2,
  headingRef,
}: {
    report: FitReport;
    /** Id for the heading, so the page can link and move focus to it. */
    headingId: string;
    /** A partial report while model rows are still arriving. */
    pending?: boolean;
    /** Rendered between the summary and the rows (the actions). */
    actions?: ReactNode;
    /** h2 for the main report, h3 inside the "Show keyword scan" disclosure. */
    level?: 2 | 3;
    /** The page moves focus here when a report finishes. */
    headingRef?: Ref<HTMLHeadingElement>;
}) {
  const groups = groupRows(report);
  const Heading = level === 2 ? 'h2' : 'h3';
  const isScan = report.mode === 'scan';

  return (
    <div data-testid={`fit-report-${report.mode}`} data-mode={report.mode}>
      <p className="eyebrow">{isScan ? 'Keyword scan' : 'Private mode · on-device model'}</p>
      <Heading
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className={`mt-3 font-display leading-[1.05] text-ink [overflow-wrap:anywhere] ${level === 2 ? 'text-[28px] md:text-[40px]' : 'text-[22px] md:text-[28px]'}`}
      >
        {report.role}
      </Heading>

      {report.coverage ? (
        <p data-testid="fit-coverage" className="mt-3 font-ui text-lg font-semibold text-ink">
          {coverageLine(report.coverage)}
          <span className="block font-ui text-sm font-medium text-muted">
            Strong counts 1, partial counts ½. Not-assessed rows are left out.
          </span>
        </p>
      ) : report.requirements.length > 0 && !pending ? (
        <p data-testid="fit-coverage" className="mt-3 max-w-[64ch] font-ui text-sm font-semibold text-ink">
          {NO_COVERAGE_LINE}
        </p>
      ) : null}

      {isScan ? (
        <p className="mt-3 max-w-[64ch] font-ui text-sm leading-relaxed text-body">{SCAN_DISCLAIMER}</p>
      ) : (
        <p className="mt-3 max-w-[64ch] font-ui text-sm leading-relaxed text-body">
          A small model on this device decided which lines are requirements. The verdicts and evidence are computed
          from my work, not generated.
        </p>
      )}

      {actions}

      {groups.length === 0 && !pending ? (
        <p className="mt-6 rounded-md border border-hairline bg-panel p-4 font-ui text-sm text-body">
          Nothing in this job description matched the skills I track, so there is nothing to show. That can mean the
          role is outside engineering, or it uses words my vocabulary doesn&rsquo;t know.
        </p>
      ) : null}

      {groups.map((group) => {
        const groupHeadingId = `${headingId}-${group.key}`;
        const GroupHeading = level === 2 ? 'h3' : 'h4';
        return (
          <section key={group.key} aria-labelledby={groupHeadingId} className="mt-8">
            <GroupHeading
              id={groupHeadingId}
              className="flex items-baseline gap-2 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-muted"
              // globals.css styles h1–h3 outside any layer, so utilities can't
              // override the display font, tracking or ink on an h3.
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'var(--color-muted)',
              }}
            >
              {group.title}
              <span className="font-normal">({group.rows.length})</span>
            </GroupHeading>
            <ul className="mt-3 space-y-3">
              {group.rows.map((row, i) => (
                <RequirementRow key={`${group.key}-${i}-${row.text}`} row={row} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
