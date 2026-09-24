'use client';

import { ArrowUpRight } from 'lucide-react';

import type { ChatReply, EvidenceCard, Finding, ProfileDetail } from '@/lib/chat/answer';

import { FitReportView } from './fit-report';

/* ---------------------------------------------------------------------------
   The chat's ENGINE CHUNK, loaded with `import()` by ask-panel.tsx at idle
   after `load` (and awaited on submit).

   `answer` is the whole brain: route → tool → template, pure code over the
   corpus in this chunk. The views below render its reply as cards. Every
   sentence they show is a string from the reply (templates filled from tool
   output, or corpus claims verbatim); the only words written here are
   captions ("More records", "Source") and structure. Visitor text is
   rendered as React text, never HTML.
   --------------------------------------------------------------------------- */

export { answer } from '@/lib/chat/answer';

const CHIP =
  'inline-flex min-h-[40px] items-center rounded-pill border border-control bg-surface px-3.5 py-2 text-left font-ui text-[13px] font-semibold leading-snug text-ink shadow-hairline transition-colors hover:border-ink hover:bg-panel';

/** Mono caption, like the fit report's group headings. */
const CAPTION = 'font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted';

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

function Card({ card, muted = false }: { card: EvidenceCard; muted?: boolean }) {
  return (
    <li
      data-evidence-card={card.id}
      className={`rounded-md border p-4 shadow-hairline ${muted ? 'border-hairline bg-panel-subtle' : 'border-hairline bg-surface'}`}
    >
      <blockquote className="font-ui text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">{card.claim}</blockquote>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {card.metric ? (
          <span className="inline-flex items-center rounded-pill bg-badge-neutral px-2.5 py-1 font-mono text-[11px] font-bold leading-tight tracking-[0.04em] text-badge-neutral-ink">
            {card.metric}
          </span>
        ) : null}
        <span className="font-ui text-[13px] text-muted">
          {card.where}
          {card.period ? ` · ${card.period}` : ''}
        </span>
        <a
          href={card.source.href}
          data-evidence-id={card.id}
          {...linkProps(card.source.external)}
          className="inline-flex min-h-[36px] items-center gap-1 font-ui text-[13px] font-semibold text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
        >
          <span>
            <span className="sr-only">Source: </span>
            {card.source.label}
          </span>
          {card.source.external ? <ExternalMark /> : null}
        </a>
      </div>
    </li>
  );
}

function Cards({ cards, more, muted }: { cards: EvidenceCard[]; more?: EvidenceCard[]; muted?: boolean }) {
  return (
    <>
      <ul className="mt-3 space-y-2.5">
        {cards.map((c) => (
          <Card key={c.id} card={c} muted={muted} />
        ))}
      </ul>
      {more && more.length > 0 ? (
        <details className="group mt-2.5">
          <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 font-ui text-sm font-semibold text-ink underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="inline-block text-[11px] transition-transform group-open:rotate-90">
              ▶
            </span>
            More records
          </summary>
          <ul className="mt-1 space-y-2.5">
            {more.map((c) => (
              <Card key={c.id} card={c} muted={muted} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function FindingView({ finding }: { finding: Finding }) {
  if (finding.status === 'found') {
    return (
      <section data-finding="found" className="mt-5 first:mt-0">
        {finding.skill ? (
          <h3 className="flex items-center gap-2 text-[20px] leading-tight">
            <span
              aria-hidden="true"
              className="inline-flex size-5 items-center justify-center rounded-pill bg-badge-lime text-[11px] text-badge-lime-ink"
            >
              ●
            </span>
            {finding.skill}
          </h3>
        ) : null}
        <p className={`${finding.skill ? 'mt-1.5' : ''} font-ui text-[15px] font-semibold text-ink`}>{finding.lead}</p>
        <Cards cards={finding.cards} more={finding.more} />
      </section>
    );
  }
  return (
    <section data-finding="none" className="mt-5 first:mt-0">
      <p className="flex items-start gap-2 font-ui text-[17px] font-semibold leading-snug text-ink">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-pill border border-control bg-surface text-[11px]"
        >
          ○
        </span>
        <span data-testid="no-evidence">{finding.lead}</span>
      </p>
      {finding.relatedLead ? (
        <div data-testid="related" className="mt-3 rounded-md border border-dashed border-control p-3 sm:p-4">
          <p className="font-ui text-sm text-body">{finding.relatedLead}</p>
          <Cards cards={finding.related} muted />
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ replies

function DetailList({ details }: { details: ProfileDetail[] }) {
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
      {details.map((d) => (
        <div key={d.label} className="contents">
          <dt className={`${CAPTION} sm:pt-1`}>{d.label}</dt>
          <dd className="-mt-2 font-ui text-[15px] text-ink [overflow-wrap:anywhere] sm:mt-0">
            {d.href ? (
              <a
                href={d.href}
                {...linkProps(!!d.external)}
                className="inline-flex min-h-[32px] items-center gap-1 font-semibold text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
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
          <button type="button" className={CHIP} onClick={() => onAsk(q)}>
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
            <p data-testid="leading-note" className="mb-4 rounded-md bg-panel p-3 font-ui text-sm leading-relaxed text-body sm:p-4">
              {reply.lead}
            </p>
          ) : null}
          {reply.figures.length > 0 ? (
            <ul data-testid="figures" className="mb-5 space-y-1 font-ui text-[15px] font-semibold text-ink">
              {reply.figures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}
          {reply.findings.map((f, i) => (
            <FindingView key={`${f.skill ?? 'query'}-${i}`} finding={f} />
          ))}
        </>
      );
    case 'fit':
      return (
        <>
          <p className="mb-5 font-ui text-[15px] text-body">{reply.lead}</p>
          <FitReportView report={reply.report} headingId={`ask-fit-${turnId}`} level={3} />
        </>
      );
    case 'profile':
      return (
        <>
          <p className="font-ui text-[17px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{reply.lead}</p>
          <DetailList details={reply.details} />
        </>
      );
    case 'project':
      return (
        <>
          <h3 className="text-[22px] leading-tight [overflow-wrap:anywhere]">{reply.name}</h3>
          <p className={`mt-2 ${CAPTION}`}>{reply.meta}</p>
          <p className="mt-3 max-w-[64ch] font-ui text-[15px] leading-relaxed text-body">{reply.summary}</p>
          {reply.links.length > 0 ? (
            <ul aria-label="Links" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {reply.links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    {...linkProps(l.external)}
                    className="inline-flex min-h-[36px] items-center gap-1 font-ui text-sm font-semibold text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
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
          <p className={`mt-5 ${CAPTION}`}>Evidence</p>
          <Cards cards={reply.cards} more={reply.more} />
        </>
      );
    case 'projects':
      return (
        <>
          <p className="font-ui text-[15px] font-semibold text-ink">{reply.lead}</p>
          <ul className="mt-3 divide-y divide-hairline rounded-md border border-hairline bg-surface">
            {reply.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="font-ui text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{item.name}</p>
                  <p className="font-ui text-[13px] text-muted">{[item.context, item.period].filter(Boolean).join(' · ')}</p>
                </div>
                {item.ask ? (
                  <button type="button" className={`${CHIP} shrink-0 self-start sm:self-auto`} onClick={() => onAsk(item.ask!)}>
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
            <p data-testid="injection-note" className="mb-3 font-ui text-[15px] font-semibold text-ink">
              {reply.note}
            </p>
          ) : null}
          <p className="font-ui text-[15px] leading-relaxed text-body">{reply.lead}</p>
          <Chips questions={reply.examples} onAsk={onAsk} label="Example questions" />
        </>
      );
    case 'unknown-skill':
      return (
        <>
          <p className="font-ui text-[17px] font-semibold leading-snug text-ink">{reply.lead}</p>
          <Chips questions={reply.suggestions} onAsk={onAsk} label="Suggested questions" />
        </>
      );
  }
}

/** A question as asked (a pasted JD is clipped to its first lines) and its reply card. */
export function AskTurn({
  turnId,
  question,
  reply,
  onAsk,
}: {
  turnId: number;
  question: string;
  reply: ChatReply;
  onAsk: (q: string) => void;
}) {
  const questionId = `ask-q-${turnId}`;
  return (
    <article aria-labelledby={questionId}>
      <div className="flex justify-end">
        <p
          id={questionId}
          className="max-w-[85%] rounded-lg rounded-br-xs bg-panel px-4 py-2.5 font-ui text-[15px] leading-snug text-ink [overflow-wrap:anywhere]"
        >
          <span className="sr-only">You asked: </span>
          {/* Clamped inside the padding, so a pasted JD's fourth line can't peek out. */}
          <span className="line-clamp-3 whitespace-pre-line">{question}</span>
        </p>
      </div>
      <div data-testid="ask-reply" className="mt-3 rounded-xl border border-hairline bg-surface p-5 shadow-card sm:p-6">
        <ReplyBody reply={reply} turnId={turnId} onAsk={onAsk} />
      </div>
    </article>
  );
}
