'use client';

import { ArrowUpRight } from 'lucide-react';
import { useId, useState } from 'react';

import { gapsLine, type ChatReply, type EvidenceCard, type Finding, type FitSummary, type ProfileDetail } from '@/lib/chat/answer';
import type { Verdict } from '@/lib/fit/contract';

import { openFullReport } from './open-report';

/* ---------------------------------------------------------------------------
   The chat's ENGINE CHUNK, loaded with `import()` by ask-panel.tsx at idle
   after `load` (and awaited on submit).

   `answer` is the whole brain: route → tool → template, pure code over the
   corpus in this chunk. The views below render its reply as cards. Every
   sentence they show is a string from the reply (templates filled from tool
   output, or corpus claims verbatim); the only words written here are
   captions ("Show 3 more", "Open the full report") and structure. Visitor
   text is rendered as React text, never HTML.
   --------------------------------------------------------------------------- */

export { answer } from '@/lib/chat/answer';

function ExternalMark() {
  return (
    <>
      <ArrowUpRight size={14} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />
      <span className="sr-only"> (opens in a new tab)</span>
    </>
  );
}

function linkProps(external: boolean) {
  return external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

// ------------------------------------------------------------------ evidence cards

/**
 * " ·" after a meta item: a no-break space binds the dot to the word before
 * it. Screen readers get a comma instead, so the metric doesn't run into the
 * entry ("…5 teams, Software Engineer II, …").
 */
const SEP = (
  <>
    <span aria-hidden="true">{'\u00a0·'}</span>
    <span className="sr-only">,</span>{' '}
  </>
);

/**
 * The source link's accessible name: the full source label, which must
 * contain the visible word (WCAG 2.5.3). "Résumé: Software Engineer II,
 * Indeed.com" and "roblox-css on GitHub" already do; "Work: Indeed Analytics
 * Extension (…)" becomes "Work card: Indeed Analytics Extension (…)".
 */
export function sourceName(short: string, label: string, external: boolean): string {
  const base = label.toLowerCase().includes(short.toLowerCase()) ? label : `${short}: ${label.replace(/^[^:]{1,12}:\s*/, '')}`;
  return external ? `${base} (opens in a new tab)` : base;
}

/**
 * One record: the claim, then ONE meta line — metric, where, when, and a
 * short source link ("Résumé", "GitHub"). The link's accessible name is the
 * full source label, starting with the visible word (WCAG 2.5.3).
 */
function Card({ card, muted = false, showWhere = true }: { card: EvidenceCard; muted?: boolean; showWhere?: boolean }) {
  return (
    <li
      data-evidence-card={card.id}
      className={`card card--md card--hairline px-3.5 py-3${muted ? ' card--subtle' : ''}`}
    >
      <blockquote className="ask-thread__claim">{card.claim}</blockquote>
      {/* Inline text, not flex: it wraps like a sentence, and each "·" is held to
          the word before it by a no-break space, so no line starts with one. */}
      <p data-card-meta className="ask-thread__meta mt-2">
        {card.metric ? (
          <span className="badge badge--neutral inline-block px-2 py-0.5 align-[1px] text-[10.5px] leading-tight tracking-[0.03em]">
            {card.metric}
          </span>
        ) : null}
        {card.metric ? SEP : null}
        {showWhere ? <span>{card.where}{SEP}</span> : null}
        {card.period ? <span className="whitespace-nowrap">{card.period}{SEP}</span> : null}
        <a
          href={card.source.href}
          data-evidence-id={card.id}
          aria-label={sourceName(card.source.short, card.source.label, card.source.external)}
          {...linkProps(card.source.external)}
          className="link inline-flex min-h-[24px] items-center gap-0.5 whitespace-nowrap align-middle font-semibold"
        >
          {card.source.short}
          {card.source.external ? <ArrowUpRight size={14} strokeWidth={2.5} aria-hidden="true" className="shrink-0" /> : null}
        </a>
      </p>
    </li>
  );
}

/** The first cards, then "Show N more": a button with aria-expanded, the rest below it. */
function Cards({
  cards,
  more,
  muted,
  showWhere,
}: {
  cards: EvidenceCard[];
  more?: EvidenceCard[];
  muted?: boolean;
  showWhere?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const moreId = useId();
  return (
    <>
      <ul className="mt-2.5 space-y-2">
        {cards.map((c) => (
          <Card key={c.id} card={c} muted={muted} showWhere={showWhere} />
        ))}
      </ul>
      {more && more.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={moreId}
            onClick={() => setOpen((v) => !v)}
            className="button button--ghost mt-1 gap-2 text-ink"
          >
            <span aria-hidden="true" className={`ask-thread__chevron${open ? ' ask-thread__chevron--open' : ''}`}>
              ▶
            </span>
            {open ? 'Show fewer' : `Show ${more.length} more`}
          </button>
          <ul id={moreId} hidden={!open} className="space-y-2">
            {more.map((c) => (
              <Card key={c.id} card={c} muted={muted} showWhere={showWhere} />
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function FindingView({ finding }: { finding: Finding }) {
  if (finding.status === 'found') {
    return (
      <section data-finding="found" className="ask-thread__finding">
        {finding.skill ? (
          <h3 className="ask-thread__finding-title">
            <span
              aria-hidden="true"
              className="ask-thread__glyph ask-thread__glyph--found"
            >
              ●
            </span>
            {finding.skill}
          </h3>
        ) : null}
        <p className={`ask-thread__lead${finding.skill ? ' mt-1' : ''}`}>{finding.lead}</p>
        <Cards cards={finding.cards} more={finding.more} />
      </section>
    );
  }
  return (
    <section data-finding="none" className="ask-thread__finding">
      {/* A heading per asked skill, found or not, so "React and Go?" reads as two sections. */}
      {finding.skill ? (
        <h3 className="ask-thread__finding-title">
          <span
            aria-hidden="true"
            className="ask-thread__glyph ask-thread__glyph--none"
          >
            ○
          </span>
          {finding.skill}
        </h3>
      ) : null}
      <p data-testid="no-evidence" className={`ask-thread__lead ask-thread__lead--snug${finding.skill ? ' mt-1' : ''}`}>
        {finding.lead}
      </p>
      {finding.relatedLead ? (
        <div data-testid="related" className="ask-thread__related mt-2.5">
          <p className="font-ui text-sm text-body">{finding.relatedLead}</p>
          <Cards cards={finding.related} muted />
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ fit summary

const COUNT_STYLE: readonly { verdict: Verdict; glyph: string; label: (n: number) => string; modifier: string }[] = [
  { verdict: 'strong', glyph: '●', label: () => 'strong', modifier: 'badge--strong' },
  { verdict: 'partial', glyph: '◐', label: () => 'partial', modifier: 'badge--partial' },
  { verdict: 'gap', glyph: '○', label: (n) => (n === 1 ? 'gap' : 'gaps'), modifier: 'badge--gap' },
  { verdict: 'not_assessed', glyph: '–', label: () => 'not assessed', modifier: 'badge--not-assessed' },
];

/**
 * A pasted JD, in the thread: role, coverage, counts, the top gaps, and a
 * button that runs the full report in the checker above (./open-report.ts).
 * The whole report in a chat bubble was several screens long.
 */
function FitSummaryCard({ summary, jd, turnId }: { summary: FitSummary; jd: string; turnId: number }) {
  const gaps = gapsLine(summary.gaps);
  const headingId = `ask-fit-${turnId}`;
  const noteId = `ask-fit-${turnId}-note`;
  return (
    <section data-testid="fit-summary" aria-labelledby={headingId} className="card card--md card--subtle p-4">
      <p className="label-mono">Keyword scan</p>
      <h3 id={headingId} className="mt-1.5 text-[20px] leading-tight [overflow-wrap:anywhere]">
        {summary.role}
      </h3>
      <p data-testid="fit-summary-coverage" className="ask-thread__lead mt-1.5">
        {summary.coverage}
      </p>
      <ul aria-label="Requirements by verdict" className="mt-3 flex flex-wrap gap-1.5">
        {COUNT_STYLE.map(({ verdict, glyph, label, modifier }) => (
          <li
            key={verdict}
            data-count-verdict={verdict}
            data-count={summary.counts[verdict]}
            className={`badge badge--verdict ${modifier} tracking-[0.06em]`}
          >
            <span aria-hidden="true">{glyph}</span>
            {summary.counts[verdict]} {label(summary.counts[verdict])}
          </li>
        ))}
      </ul>
      {gaps ? (
        <p data-testid="fit-summary-gaps" className="mt-3 font-ui text-sm leading-relaxed text-body [overflow-wrap:anywhere]">
          {gaps}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => openFullReport(jd)}
          aria-describedby={noteId}
          className="button button--pill button--primary button--fade min-h-[44px] justify-center px-5 py-2.5 font-ui text-[15px] font-bold"
        >
          Open the full report
        </button>
        <span id={noteId} className="ask-thread__aside">Every requirement and its evidence, in the checker above.</span>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ replies

function DetailList({ details }: { details: ProfileDetail[] }) {
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
      {details.map((d) => (
        <div key={d.label} className="contents">
          <dt className="label-mono sm:pt-1">{d.label}</dt>
          <dd className="-mt-2 font-ui text-[15px] text-ink [overflow-wrap:anywhere] sm:mt-0">
            {d.href ? (
              <a
                href={d.href}
                {...linkProps(!!d.external)}
                className="link inline-flex min-h-[32px] items-center gap-1 font-semibold"
              >
                {d.value}
                {d.external ? <ExternalMark /> : null}
              </a>
            ) : (
              d.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Chips({ questions, onAsk, label }: { questions: string[]; onAsk: (q: string) => void; label: string }) {
  return (
    <ul aria-label={label} className="mt-4 flex flex-wrap gap-2">
      {questions.map((q) => (
        <li key={q}>
          <button type="button" className="button button--pill button--secondary button--chip" onClick={() => onAsk(q)}>
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReplyBody({ reply, turnId, onAsk }: { reply: ChatReply; turnId: number; onAsk: (q: string) => void }) {
  switch (reply.kind) {
    case 'evidence':
      return (
        <>
          {reply.lead ? (
            <p data-testid="leading-note" className="ask-thread__note mb-4">
              {reply.lead}
            </p>
          ) : null}
          {reply.figures.length > 0 ? (
            <ul data-testid="figures" className="ask-thread__lead mb-4 space-y-1">
              {reply.figures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}
          {reply.figureNote ? (
            <p data-testid="no-figure" className="ask-thread__lead mb-4">
              {reply.figureNote}
            </p>
          ) : null}
          {reply.findings.map((f, i) => (
            <FindingView key={`${f.skill ?? 'query'}-${i}`} finding={f} />
          ))}
        </>
      );
    case 'fit':
      return (
        <>
          <p className="mb-3 font-ui text-[15px] text-body">{reply.lead}</p>
          <FitSummaryCard summary={reply.summary} jd={reply.jd} turnId={turnId} />
        </>
      );
    case 'profile':
      return (
        <>
          <p className="ask-thread__lead ask-thread__lead--lg [overflow-wrap:anywhere]">{reply.lead}</p>
          <DetailList details={reply.details} />
        </>
      );
    case 'project':
      return (
        <>
          <h3 className="text-[22px] leading-tight [overflow-wrap:anywhere]">{reply.name}</h3>
          <p className="label-mono mt-2">{reply.meta}</p>
          <p className="ask-thread__text mt-3 max-w-[64ch]">{reply.summary}</p>
          {reply.links.length > 0 ? (
            <ul aria-label="Links" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {reply.links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    {...linkProps(l.external)}
                    className="link inline-flex min-h-[36px] items-center gap-1 font-ui text-sm font-semibold"
                  >
                    {l.label}
                    {l.external ? <ExternalMark /> : null}
                  </a>
                </li>
              ))}
            </ul>
          ) : reply.linkNote ? (
            <p className="mt-3 font-ui text-sm text-muted">{reply.linkNote}</p>
          ) : null}
          <p className="label-mono mt-5">Evidence</p>
          <Cards cards={reply.cards} more={reply.more} showWhere={false} />
        </>
      );
    case 'projects':
      return (
        <>
          <p className="ask-thread__lead">{reply.lead}</p>
          <ul className="card card--md mt-3 divide-y divide-hairline">
            {reply.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="ask-thread__lead [overflow-wrap:anywhere]">{item.name}</p>
                  <p className="ask-thread__aside">{[item.context, item.period].filter(Boolean).join(' · ')}</p>
                </div>
                {item.ask ? (
                  <button type="button" className="button button--pill button--secondary button--chip shrink-0 self-start sm:self-auto" onClick={() => onAsk(item.ask!)}>
                    {item.ask}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      );
    case 'help':
      return (
        <>
          {reply.note ? (
            <p data-testid="injection-note" className="ask-thread__lead mb-3">
              {reply.note}
            </p>
          ) : null}
          <p className="ask-thread__text">{reply.lead}</p>
          <Chips questions={reply.examples} onAsk={onAsk} label="Example questions" />
        </>
      );
    case 'unknown-skill':
      return (
        <>
          <p className="ask-thread__lead ask-thread__lead--lg">{reply.lead}</p>
          <Chips questions={reply.suggestions} onAsk={onAsk} label="Suggested questions" />
        </>
      );
  }
}

/** A question as asked (a pasted JD is clipped to its first lines) and its reply card. */
export function AskTurn({
  turnId,
  position,
  question,
  reply,
  onAsk,
}: {
  turnId: number;
  /** 1-based place in the thread, for the article's name. */
  position: number;
  question: string;
  reply: ChatReply;
  onAsk: (q: string) => void;
}) {
  // The article is named "Question N", not by the question itself: a pasted
  // JD would make a name thousands of characters long, and the bubble below
  // already reads "You asked: …" (or, for a JD, just its role).
  const pastedJd = reply.kind === 'fit' ? reply.summary.role : null;
  return (
    <article aria-label={`Question ${position}`}>
      <div className="flex justify-end">
        <p className="ask-thread__bubble">
          <span className="sr-only">{pastedJd !== null ? `You pasted a job description: ${pastedJd}` : 'You asked: '}</span>
          {/* Clamped inside the padding, so a pasted JD's fourth line can't peek out. */}
          <span aria-hidden={pastedJd !== null ? true : undefined} className="line-clamp-3 whitespace-pre-line">
            {question}
          </span>
        </p>
      </div>
      <div data-testid="ask-reply" className="card card--elevated mt-3 p-4 sm:p-6">
        <ReplyBody reply={reply} turnId={turnId} onAsk={onAsk} />
      </div>
    </article>
  );
}
