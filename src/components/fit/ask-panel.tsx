'use client';

import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { afterLoadAndIdle } from './private-mode';

type Engine = typeof import('./ask-results');
type Reply = import('@/lib/chat/answer').ChatReply;

/* ---------------------------------------------------------------------------
   AskPanel — "Ask about my work", the model-free chat on /fit.

   First-load JS is this form, the example chips and the thread's frame. The
   engine (router, tools, corpus, reply views) is `./ask-results`, fetched at
   idle after `load` like the fit checker's, and awaited on submit.

   Nothing leaves the page: `answer()` is pure code over the corpus bundled
   in that chunk. There is no fetch here, no worker, and no storage; the
   thread lives in React state and is gone on reload. e2e/fit-chat.spec.ts
   checks the wire.

   Focus stays in the question box after a reply, so the next question can be
   typed straight away (a chip sends focus back there too). Each reply is
   announced once through a polite live region, and the new turn is scrolled
   into view (instantly when the visitor prefers reduced motion). Turns are
   appended below the earlier ones, so nothing already on screen moves.
   --------------------------------------------------------------------------- */

/** `JD_MAX_CHARS`, restated so this first-load module doesn't import the fit contract. */
const MESSAGE_LIMIT = 12_000;

/**
 * The example questions, restated from `EXAMPLE_QUESTIONS` in
 * src/lib/chat/answer.ts so the chips render before the engine loads.
 * __tests__/chat/ask-panel.test.tsx holds the two lists equal.
 */
export const PANEL_EXAMPLES: readonly string[] = [
  'Has he used React?',
  'Kubernetes?',
  'React and Go?',
  'Tell me about r3f-projectiles',
  'How do I contact him?',
  'Is he available?',
];

let engineModule: Promise<Engine> | null = null;
const loadEngine = () => (engineModule ??= import('./ask-results'));

interface Turn {
  id: number;
  question: string;
  reply: Reply;
}

const CHIP =
  'inline-flex min-h-[40px] items-center rounded-pill border border-control bg-surface px-3.5 py-2 text-left font-ui text-[13px] font-semibold leading-snug text-ink shadow-hairline transition-colors hover:border-ink hover:bg-panel';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AskPanel() {
  const uid = useId();
  const ids = { field: `${uid}-q`, hint: `${uid}-hint`, error: `${uid}-error` };

  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const turnRefs = useRef(new Map<number, HTMLLIElement>());
  const nextId = useRef(1);
  const busy = useRef(false);

  useEffect(() => afterLoadAndIdle(() => void loadEngine()), []);

  // The newest turn, into view once it has rendered.
  const lastId = turns.at(-1)?.id;
  useEffect(() => {
    if (lastId === undefined) return;
    turnRefs.current.get(lastId)?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [lastId]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q) {
      setError('Type a question first, or pick one of the examples.');
      fieldRef.current?.focus();
      return;
    }
    if (busy.current) return;
    busy.current = true;
    let loaded: Engine;
    try {
      loaded = await loadEngine();
    } catch {
      engineModule = null;
      busy.current = false;
      setError('The answers couldn’t load. Check your connection and try again.');
      return;
    }
    busy.current = false;
    const reply = loaded.answer(q);
    setEngine(loaded);
    setError(null);
    setText('');
    setTurns((prev) => [...prev, { id: nextId.current++, question: q, reply }]);
    setAnnouncement(reply.announce);
    fieldRef.current?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(text);
  }

  // Enter sends; Shift+Enter is a new line (for pasting a job description by hand).
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void ask(text);
    }
  }

  function clear() {
    setTurns([]);
    setAnnouncement('Conversation cleared.');
    fieldRef.current?.focus();
  }

  return (
    <div data-testid="ask-panel">
      <form onSubmit={onSubmit} noValidate className="rounded-xl border border-hairline bg-surface p-5 shadow-raised sm:p-7">
        <label htmlFor={ids.field} className="font-ui text-sm font-semibold text-ink">
          Your question
        </label>
        <p id={ids.hint} className="mt-1 font-ui text-sm text-muted">
          A skill, a project, how to reach me, or a whole job description. Enter sends; Shift+Enter adds a line.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            ref={fieldRef}
            id={ids.field}
            name="question"
            rows={2}
            maxLength={MESSAGE_LIMIT}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Has he used GraphQL?"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={[ids.hint, error ? ids.error : null].filter(Boolean).join(' ')}
            className="block min-h-[52px] w-full resize-y rounded-sm border border-control bg-paper px-3.5 py-3 font-ui text-base leading-relaxed text-ink shadow-hairline transition-colors placeholder:text-muted hover:border-ink/40"
          />
          <button
            type="submit"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-pill bg-cta px-6 py-3 font-ui text-base font-bold text-cta-ink shadow-cta transition-opacity hover:opacity-95"
          >
            Ask
          </button>
        </div>
        {error ? (
          <p id={ids.error} role="alert" className="mt-2 font-ui text-sm font-semibold text-ink">
            {error}
          </p>
        ) : null}

        <div className="mt-5">
          <p id={`${uid}-examples`} className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Try
          </p>
          <ul aria-labelledby={`${uid}-examples`} className="mt-2 flex flex-wrap gap-2">
            {PANEL_EXAMPLES.map((q) => (
              <li key={q}>
                <button type="button" className={CHIP} onClick={() => void ask(q)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </form>

      {/* Always in the DOM, so the first reply is announced. */}
      <p aria-live="polite" data-testid="ask-status" className="sr-only">
        {announcement}
      </p>

      {turns.length > 0 && engine ? (
        <section aria-label="Answers" className="mt-8">
          <ol className="space-y-6">
            {turns.map((turn) => (
              <li
                key={turn.id}
                ref={(el) => {
                  if (el) turnRefs.current.set(turn.id, el);
                  else turnRefs.current.delete(turn.id);
                }}
                data-testid="ask-turn"
                data-kind={turn.reply.kind}
                className="scroll-mt-24"
              >
                <engine.AskTurn turnId={turn.id} question={turn.question} reply={turn.reply} onAsk={(q) => void ask(q)} />
              </li>
            ))}
          </ol>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={clear}
              className="inline-flex min-h-[44px] items-center rounded-pill px-4 font-ui text-sm font-semibold text-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              Clear answers
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
