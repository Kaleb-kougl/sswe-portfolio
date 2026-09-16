'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { PROJECT_SNIPPETS, type ProjectSnippet } from '@/data/projectSnippets';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * ScriptTab — the viewport's Scene / Script toggle plus the Script panel.
 *
 * Scene is the live 3D canvas (untouched, and never unmounted — the panel
 * simply covers it). Script shows a VERBATIM excerpt of the selected project's
 * real source, with a link to the full file. That is the whole point: this is
 * not a mocked-up code window, it is the file on disk. See the provenance
 * comment at the top of src/data/projectSnippets.ts.
 *
 * The toggle renders only for file ids that actually have a real excerpt, so a
 * project with nothing to show never advertises a Script tab.
 *
 * Semantics: two `aria-pressed` toggle buttons inside a labelled group, rather
 * than a tablist. The Scene "panel" is the existing `<main aria-label="3D
 * Viewport">`, which cannot also be a tabpanel, and a half-correct tablist is
 * worse for a screen reader than a correct pair of toggle buttons.
 */

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

type ViewportMode = 'scene' | 'script';

export function ScriptTab() {
  const activeFileId = useEngineStore((s) => s.activeFileId);

  /*
    The open file id is the state, not a boolean: selecting a different file
    therefore lands on the Scene automatically, with no reset effect and no
    setState during render.
  */
  const [scriptFileId, setScriptFileId] = useState<string | null>(null);
  const mode: ViewportMode =
    scriptFileId !== null && scriptFileId === activeFileId ? 'script' : 'scene';

  const snippet = activeFileId ? PROJECT_SNIPPETS[activeFileId] : undefined;

  const showScene = useCallback(() => setScriptFileId(null), []);
  const showScript = useCallback(() => setScriptFileId(activeFileId), [activeFileId]);

  // Escape backs out of the code view.
  useEffect(() => {
    if (mode !== 'script') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScriptFileId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode]);

  if (!snippet) return null;

  return (
    <>
      {mode === 'script' && (
        <div className="@container pointer-events-auto absolute inset-0 z-[70]">
          <ScriptPanel snippet={snippet} />
        </div>
      )}

      {/* Bottom-left: clear of the perf/telemetry HUDs, which own the top edge. */}
      <div
        role="group"
        aria-label="Viewport mode"
        className="pointer-events-auto absolute bottom-3 left-3 z-[80] flex border-[3px] border-border bg-bg-panel shadow-[4px_4px_0_#161310]"
      >
        <ModeButton label="Scene" isActive={mode === 'scene'} onClick={showScene} />
        <span aria-hidden="true" className="w-[3px] shrink-0 self-stretch bg-border" />
        <ModeButton label="Script" isActive={mode === 'script'} onClick={showScript} />
      </div>
    </>
  );
}

function ModeButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`min-h-[44px] px-4 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${FOCUS_RING} ${
        isActive
          ? 'bg-interactive text-interactive-ink'
          : 'bg-bg-panel text-text-primary hover:bg-header-bg'
      }`}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Script panel                                                      */
/* ------------------------------------------------------------------ */

function ScriptPanel({ snippet }: { snippet: ProjectSnippet }) {
  const lines = useMemo(() => snippet.code.split('\n'), [snippet.code]);
  const gutterWidth = `${String(snippet.lineStart + lines.length).length}ch`;

  return (
    // grid-texture owns background-color and sets position:relative, so it goes
    // on its own element with no bg-* utility beside it.
    <div className="@container grid-texture flex h-full w-full flex-col overflow-hidden">
      {/* File tab strip — the IDE idiom, same recipe as the panel headers. */}
      <div className="flex shrink-0 items-stretch border-b-[3px] border-header-ink bg-header-bg">
        <span className="flex items-center gap-2 border-r-[3px] border-header-ink bg-bg-panel px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-header-ink">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 bg-interactive" />
          {snippet.fileName}
        </span>
        <span className="ml-auto flex items-center px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
          {snippet.language}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* File rail — hidden when the panel is too narrow to earn it. */}
        <nav
          aria-label="Source location"
          className="w-[190px] shrink-0 overflow-hidden border-r-[3px] border-border py-2 @max-[560px]:hidden"
        >
          <FileRail filePath={snippet.filePath} fileName={snippet.fileName} />
        </nav>

        {/* Code surface */}
        <div className="min-w-0 flex-1 overflow-auto">
          <pre className="w-max min-w-full px-0 py-2 font-mono text-[11.5px] leading-[1.65] text-text-primary">
            <code>
              {lines.map((line, index) => (
                <span key={index} className="flex">
                  <span
                    aria-hidden="true"
                    className="sticky left-0 mr-3 shrink-0 select-none border-r-2 border-border bg-header-bg px-2 text-right text-text-muted"
                    style={{ width: `calc(${gutterWidth} + 1rem)` }}
                  >
                    {snippet.lineStart + index}
                  </span>
                  <span className="pr-4 whitespace-pre">
                    {highlight(line)}
                    {line.length === 0 ? ' ' : null}
                  </span>
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>

      {/* Provenance footer — the excerpt is worth nothing if you can't check it. */}
      <div className="shrink-0 border-t-[3px] border-border bg-bg-panel px-3 py-2">
        <p className="text-[11px] leading-snug text-text-primary">{snippet.caption}</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
            {snippet.origin}:{snippet.lineStart}
          </span>
          <a
            href={snippet.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-[32px] items-center gap-1.5 border-2 border-border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-text-accent underline underline-offset-2 hover:bg-header-bg ${FOCUS_RING}`}
          >
            {snippet.sourceLabel}
            <ExternalLink size={12} strokeWidth={2.5} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}

/** A two-or-three-row file tree stub showing where the excerpt lives. */
function FileRail({ filePath, fileName }: { filePath: string; fileName: string }) {
  const segments = filePath.split('/').filter(Boolean);

  return (
    <ul className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
      {segments.map((segment, depth) => (
        <li
          key={`${segment}-${depth}`}
          className="truncate py-0.5 pr-2"
          style={{ paddingLeft: `${0.5 + depth * 0.65}rem` }}
        >
          <span aria-hidden="true" className="mr-1">
            ▾
          </span>
          {segment}/
        </li>
      ))}
      <li
        className="truncate bg-interactive py-1 pr-2 font-bold text-interactive-ink"
        style={{ paddingLeft: `${0.5 + segments.length * 0.65}rem` }}
        aria-current="true"
      >
        {fileName}
      </li>
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  Minimal TS/TSX tokenizer                                          */
/* ------------------------------------------------------------------ */

const KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally',
  'for', 'from', 'function', 'if', 'implements', 'import', 'in', 'instanceof',
  'interface', 'let', 'new', 'null', 'of', 'return', 'satisfies', 'static',
  'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var',
  'void', 'while', 'yield',
]);

/**
 * Matches, in order: a line comment, a quoted string, a number, an identifier.
 * Runs per line — every excerpt in projectSnippets.ts is documented to contain
 * no block comments and no multi-line strings, which is what makes that safe.
 */
const TOKEN_RE =
  /(\/\/.*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

/* All four hues clear 7:1 against the paper background. */
const TOKEN_CLASS = {
  comment: 'italic text-text-muted',
  string: 'text-[#0e6245]',
  number: 'text-[#8a3b00]',
  keyword: 'font-bold text-interactive',
  entity: 'text-[#5b2d90]',
  call: 'font-semibold text-text-primary',
} as const;

function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(TOKEN_RE.source, 'g');
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(line)) !== null) {
    if (match.index > cursor) {
      out.push(<Fragment key={key++}>{line.slice(cursor, match.index)}</Fragment>);
    }

    // Unmatched alternatives are `undefined` at runtime, which RegExpExecArray
    // does not model — hence the explicit widening.
    const groups = match as unknown as (string | undefined)[];
    const text = match[0];
    const comment = groups[1];
    const str = groups[2];
    const num = groups[3];
    const ident = groups[4];
    let className: string | undefined;

    if (comment !== undefined) {
      className = TOKEN_CLASS.comment;
    } else if (str !== undefined) {
      className = TOKEN_CLASS.string;
    } else if (num !== undefined) {
      className = TOKEN_CLASS.number;
    } else if (ident !== undefined) {
      if (KEYWORDS.has(ident)) {
        className = TOKEN_CLASS.keyword;
      } else if (/^[A-Z]/.test(ident)) {
        className = TOKEN_CLASS.entity;
      } else if (line[re.lastIndex] === '(') {
        className = TOKEN_CLASS.call;
      }
    }

    out.push(
      className ? (
        <span key={key++} className={className}>
          {text}
        </span>
      ) : (
        <Fragment key={key++}>{text}</Fragment>
      )
    );

    cursor = re.lastIndex;
  }

  if (cursor < line.length) {
    out.push(<Fragment key={key++}>{line.slice(cursor)}</Fragment>);
  }

  return out;
}
