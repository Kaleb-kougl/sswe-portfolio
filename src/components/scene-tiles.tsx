'use client';

import { useCallback, type ReactNode } from 'react';
import { FILE_LOG_MAP } from '@/data/consoleLogs';
import { useEngineStore } from '@/store/useEngineStore';

/**
 * SceneTiles — the overview's project shortcuts.
 *
 * Every tile draws that project's OWN interface rather than a generic icon,
 * so the grid reads as five different things instead of five files.
 *
 * Build rule: static HTML + inline SVG only. No extra WebGL canvases — the
 * live 3D belongs to the main viewport and nowhere else.
 *
 * Drawing convention (keeps the strict COLOR_ROLES intact): everything is ink
 * line-art on paper, and `interactive` marks exactly one element per drawing —
 * the live/selected node. `action` and `status` never appear here; tangerine is
 * the single CTA and lime is live status only.
 */

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-interactive';

const SVG_PROPS = {
  viewBox: '0 0 168 52',
  role: 'presentation' as const,
  'aria-hidden': true,
  className: 'h-[52px] w-full text-text-primary',
  preserveAspectRatio: 'xMidYMid meet',
};

const LABEL_PROPS = {
  className: 'fill-current font-mono text-[8px] font-bold uppercase tracking-[0.08em]',
  textAnchor: 'middle' as const,
  dominantBaseline: 'middle' as const,
};

/** BonkBall — the bot brain's finite state machine, as a strip. */
function FsmStripDrawing() {
  return (
    <svg {...SVG_PROPS}>
      <rect x={2} y={15} width={44} height={22} className="fill-interactive stroke-current" strokeWidth={2} />
      <text {...LABEL_PROPS} x={24} y={27} className={`${LABEL_PROPS.className} fill-interactive-ink`}>
        Patrol
      </text>

      <path d="M47 26 H58" stroke="currentColor" strokeWidth={2} />
      <path d="M61 26 L54 22 L54 30 Z" fill="currentColor" />

      <rect x={62} y={15} width={44} height={22} fill="none" stroke="currentColor" strokeWidth={2} />
      <text {...LABEL_PROPS} x={84} y={27}>
        Aggro
      </text>

      <path d="M107 26 H118" stroke="currentColor" strokeWidth={2} />
      <path d="M121 26 L114 22 L114 30 Z" fill="currentColor" />

      <rect x={122} y={15} width={44} height={22} fill="none" stroke="currentColor" strokeWidth={2} />
      <text {...LABEL_PROPS} x={144} y={27}>
        Flee
      </text>
    </svg>
  );
}

/** Core Web Vitals Profiler — three dials. */
function GaugesDrawing() {
  const dials = [
    { cx: 30, label: 'LCP', nx: 19, ny: 21 },
    { cx: 84, label: 'INP', nx: 80, ny: 17 },
    { cx: 138, label: 'CLS', nx: 146, ny: 18 },
  ];

  return (
    <svg {...SVG_PROPS}>
      {dials.map(({ cx, label, nx, ny }) => (
        <g key={label}>
          <path
            d={`M${cx - 18} 32 A18 18 0 0 1 ${cx + 18} 32`}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
          />
          <path d={`M${cx - 18} 32 H${cx + 18}`} stroke="currentColor" strokeWidth={2} />
          <path
            d={`M${cx} 32 L${nx} ${ny}`}
            className="stroke-interactive"
            strokeWidth={3}
            strokeLinecap="butt"
          />
          <circle cx={cx} cy={32} r={3} className="fill-interactive stroke-current" strokeWidth={1.5} />
          <text {...LABEL_PROPS} x={cx} y={45}>
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Indeed Analytics extension — the popup, listing tracked events. */
function ExtensionPopupDrawing() {
  return (
    <svg {...SVG_PROPS}>
      <rect x={26} y={3} width={116} height={46} fill="none" stroke="currentColor" strokeWidth={2} />
      <rect x={26} y={3} width={116} height={11} className="fill-interactive stroke-current" strokeWidth={2} />
      <text
        {...LABEL_PROPS}
        x={84}
        y={9}
        className={`${LABEL_PROPS.className} fill-interactive-ink`}
      >
        Tracked events
      </text>

      {[0, 1, 2].map((row) => {
        const y = 21 + row * 10;
        const barWidth = [96, 74, 84][row];
        return (
          <g key={row}>
            <rect
              x={32}
              y={y - 3}
              width={7}
              height={7}
              fill={row === 0 ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={1.5}
            />
            <path d={`M44 ${y + 0.5} H${44 + barWidth}`} stroke="currentColor" strokeWidth={2} />
          </g>
        );
      })}
    </svg>
  );
}

/** Webpack 5 Module Federation — one host, two remotes feeding in. */
function FederationDrawing() {
  return (
    <svg {...SVG_PROPS}>
      <rect x={58} y={2} width={52} height={18} className="fill-interactive stroke-current" strokeWidth={2} />
      <text {...LABEL_PROPS} x={84} y={11} className={`${LABEL_PROPS.className} fill-interactive-ink`}>
        Host
      </text>

      <path d="M84 20 L79 27 L89 27 Z" fill="currentColor" />
      <path d="M32 33 V28 H136 V33" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M84 28 V26" stroke="currentColor" strokeWidth={2} />

      <rect x={4} y={33} width={56} height={16} fill="none" stroke="currentColor" strokeWidth={2} />
      <text {...LABEL_PROPS} x={32} y={41.5}>
        Remote_a
      </text>

      <rect x={108} y={33} width={56} height={16} fill="none" stroke="currentColor" strokeWidth={2} />
      <text {...LABEL_PROPS} x={136} y={41.5}>
        Remote_b
      </text>
    </svg>
  );
}

/** Combat System — the bullet-pattern engine: one emitter, a radial burst. */
function BulletPatternDrawing() {
  const bullets = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const ring = i % 2 === 0 ? 1 : 0.62;
    return {
      key: i,
      cx: 84 + Math.cos(angle) * 70 * ring,
      cy: 26 + Math.sin(angle) * 21 * ring,
      r: i % 2 === 0 ? 2.6 : 2,
    };
  });

  return (
    <svg {...SVG_PROPS}>
      {bullets.map(({ key, cx, cy, r }) => (
        <circle key={key} cx={cx} cy={cy} r={r} fill="currentColor" />
      ))}
      <circle cx={84} cy={26} r={7} className="fill-interactive stroke-current" strokeWidth={2} />
      <path d="M84 16 V10 M84 42 V36 M70 26 H62 M98 26 H106" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

interface TileDefinition {
  fileId: string;
  label: string;
  caption: string;
  drawing: ReactNode;
}

const TILES: TileDefinition[] = [
  {
    fileId: 'hammerball',
    label: 'BonkBall',
    caption: 'Roblox · FSM bot AI',
    drawing: <FsmStripDrawing />,
  },
  {
    fileId: 'combat_system',
    label: 'Combat System',
    caption: 'Bullet-pattern engine',
    drawing: <BulletPatternDrawing />,
  },
  {
    fileId: 'cwv-profiler',
    label: 'Core Web Vitals Profiler',
    caption: 'Frontend SLOs',
    drawing: <GaugesDrawing />,
  },
  {
    fileId: 'analytics-extension',
    label: 'Analytics Extension',
    caption: 'Chrome · Manifest V3',
    drawing: <ExtensionPopupDrawing />,
  },
  {
    fileId: 'webpack-federation',
    label: 'Webpack 5 Federation',
    caption: 'Microfrontend host',
    drawing: <FederationDrawing />,
  },
];

export function SceneTiles() {
  const setActiveFile = useEngineStore((s) => s.setActiveFile);

  const handleSelect = useCallback(
    (fileId: string) => {
      setActiveFile(fileId, FILE_LOG_MAP[fileId]);
    },
    [setActiveFile]
  );

  return (
    // @container so the breakpoint tracks the viewport PANEL's width, not the
    // window's — this grid lives inside a resizable pane.
    <section aria-label="Featured projects" className="@container w-full">
      <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
        Featured scenes
      </h2>
      <ul className="grid grid-cols-2 gap-3 @max-[460px]:grid-cols-1">
        {TILES.map(({ fileId, label, caption, drawing }) => (
          <li key={fileId}>
            <button
              type="button"
              onClick={() => handleSelect(fileId)}
              aria-label={`Open ${label} in the hierarchy`}
              className={`flex min-h-[44px] w-full flex-col border-[3px] border-border bg-bg-panel text-left shadow-[4px_4px_0_#161310] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#161310] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_#161310] ${FOCUS_RING}`}
            >
              <span className="block border-b-[3px] border-border bg-header-bg px-2 py-2">
                {drawing}
              </span>
              <span className="block px-2 pt-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-text-primary">
                {label}
              </span>
              <span className="block px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
                {caption}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
