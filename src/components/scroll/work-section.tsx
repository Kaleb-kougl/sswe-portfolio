import type { ReactNode } from 'react';
import { ProjectileDemoLauncher } from '@/components/scroll/projectile-demo-launcher';
import { WORK_PROJECTS, type WorkBadgeTone, type WorkProjectId } from '@/data/workProjects';

/**
 * WorkSection — "Things I've shipped."
 *
 * A 2x2 card grid (one column under 768px). Each card draws that project's
 * OWN interface rather than a generic icon, so four cards read as four
 * different things.
 *
 * Build rule: static HTML and inline SVG only. No WebGL here — the live 3D
 * belongs to the page background and nowhere else.
 *
 * This is a Server Component on purpose. There is no state, no event handler
 * and no browser API in this file, so per the Next.js server/client guide it
 * stays on the server and ships (almost) zero JavaScript. The one exception is
 * `ProjectileDemoLauncher`, a Client Component imported into the
 * r3f-projectiles card: a Server Component may not call
 * `dynamic(..., { ssr: false })`, so that boundary lives in its own file and
 * everything it defers — the dialog, the canvas, three, R3F — stays out of the
 * initial payload until the button is pressed.
 *
 * Every drawing is deterministic — no Math.random, no Date — so the markup is
 * byte-identical on every render.
 */

/* --------------------------------------------------------------------------
 * Illustration pigments
 *
 * The r3f-projectiles panel is a dark "screenshot" that deliberately steps
 * outside the light-surface token system: its own background is #161310, so
 * the paper-tuned text tokens do not apply inside it. These four are the
 * bullet pigments the package itself renders, kept as literals because they
 * are picture, not interface.
 *
 * `illustration-orange` is a lightened orange rather than the `cta` token, so
 * nothing in a drawing can ever be mistaken for the one orange button.
 * ----------------------------------------------------------------------- */
const DOT_PIGMENTS = [
  '#BFF03A', // lime
  '#FF8A4C', // illustration-orange (NOT the cta token)
  '#FFFDF7', // paper
  '#8B9BFF', // periwinkle
] as const;

/**
 * Thirty bullets on an elliptical ring, the shape `gen.ring` actually
 * produces. The radius breathes via a sine of the angle so the ring reads as
 * live spawn data instead of a perfect circle — deterministic, not random.
 */
const RING_DOTS = Array.from({ length: 30 }, (_, i) => {
  const t = (i / 30) * Math.PI * 2;
  const wobble = 1 + 0.09 * Math.sin(t * 3);
  return {
    key: i,
    cx: Number((140 + Math.cos(t) * 108 * wobble).toFixed(2)),
    cy: Number((48 + Math.sin(t) * 30 * wobble).toFixed(2)),
    r: i % 5 === 0 ? 3.4 : 2.2,
    fill: DOT_PIGMENTS[i % DOT_PIGMENTS.length],
  };
});

/** Shared shell for every illustration: a fixed 112px panel above the copy. */
function IllustrationPanel({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      role="presentation"
      aria-hidden
      className={`flex h-28 w-full items-center justify-center overflow-hidden rounded-md ${className}`}
    >
      {children}
    </div>
  );
}

/** r3f-projectiles — the bullet pool, mid-burst, on the package's dark canvas. */
function ProjectilePoolDrawing() {
  return (
    <IllustrationPanel className="relative bg-[#161310]">
      <svg
        viewBox="0 0 280 112"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        {RING_DOTS.map((dot) => (
          <circle key={dot.key} cx={dot.cx} cy={dot.cy} r={dot.r} fill={dot.fill} />
        ))}
      </svg>
      {/*
        Lime as text is normally forbidden — on paper it is illegible. Inside
        this dark panel it is the legible choice (#BFF03A on #161310 clears
        13:1), and it is the pigment the package emits. Panel-local exception.
      */}
      <span className="absolute bottom-2.5 left-3.5 font-mono text-[10px] font-bold tracking-[0.08em] text-lime">
        20,000 bullets · 120 fps
      </span>
    </IllustrationPanel>
  );
}

/**
 * roblox-css — one CSS block on the left, the instances it emits on the right.
 *
 * NOT an impression of the output. Every line of the right pane is what
 * `webStyle()` actually produces for the left pane, read off
 * roblox-css/src/styles/webStyle.ts at v0.1.1:
 *
 *   width: calc(100% - 24px)  → step 1, Size. `height` is omitted, so it
 *                               falls back to "100%" → UDim(1, 0).
 *   background: linear-...    → step 2.5, a <uigradient> child. With no
 *                               direction given, gradientParser defaults to
 *                               180deg (CSS "to bottom") and Roblox rotation
 *                               is angle - 90, so 90.
 *   border-radius: 8px        → step 4, <uicorner> CornerRadius UDim(0, 8).
 *   display/flex-direction    → step 6, <uilistlayout>. FillDirection is
 *                               Horizontal only because flex-direction is
 *                               spelled out; omitted, this package defaults
 *                               to Vertical, which is NOT the CSS default.
 *   gap: 8px                  → the same layout's Padding, UDim(0, 8).
 *
 * The child order is the order webStyle pushes them, not a tidied one.
 */
const CSS_DECLARATIONS: readonly (readonly [property: string, value: string])[] = [
  ['width', 'calc(100% - 24px);'],
  ['background', ''],
  ['', '  linear-gradient('],
  ['', '    #BFF03A, #8B9BFF);'],
  ['border-radius', '8px;'],
  ['display', 'flex;'],
  ['flex-direction', 'row;'],
  ['gap', '8px;'],
] as const;

/**
 * `mark` is "·" on the instances webStyle injects as children and empty on
 * everything else — the Frame itself, its own props, and the continuation
 * lines that carry a child's properties.
 *
 * A middle dot rather than the box-drawing "├"/"└" this wants to be: the mono
 * face has no box-drawing glyphs, so those fell back to a font that renders
 * both as the same short dash, which loses the one thing the characters were
 * there for. "·" is already in this page's type (the badge, the bullet count),
 * so it is known to render.
 */
const EMITTED_INSTANCES: readonly {
  readonly mark: string;
  readonly name: string;
  readonly detail: string;
}[] = [
  { mark: '', name: 'Frame', detail: '' },
  { mark: '  ', name: 'Size', detail: 'UDim2(1,-24, 1,0)' },
  { mark: '  · ', name: 'UIGradient', detail: '' },
  { mark: '      ', name: '', detail: 'Rotation 90' },
  { mark: '  · ', name: 'UICorner', detail: 'UDim(0,8)' },
  { mark: '  · ', name: 'UIListLayout', detail: '' },
  { mark: '      ', name: '', detail: 'Horizontal' },
  { mark: '      ', name: '', detail: 'Padding UDim(0,8)' },
] as const;

function CssTranslationDrawing() {
  return (
    <IllustrationPanel className="gap-1.5 bg-panel p-2">
      {/* Left: the source. Property names take the link ink, values the body
          ink, which is the same two-tone the rest of the site gives code. */}
      <div className="min-w-0 flex-1 self-stretch overflow-hidden rounded-xs border border-hairline bg-surface px-2 py-0.5 shadow-hairline">
        <code className="block whitespace-pre font-mono text-[7px] leading-[1.4] md:text-[8px]">
          {CSS_DECLARATIONS.map(([property, value]) => (
            <span key={`${property}${value}`} className="block">
              {property ? <span className="text-link">{property}: </span> : null}
              <span className="text-body">{value}</span>
            </span>
          ))}
        </code>
      </div>

      <svg viewBox="0 0 22 10" className="w-4 shrink-0 text-muted" fill="none">
        <path d="M0 5h14" stroke="currentColor" strokeWidth={1.5} />
        <path d="M20 5 13 1.5v7Z" fill="currentColor" />
      </svg>

      {/* Right: the emitted tree, on the package's own dark canvas. Paper for
          instance names, periwinkle for the values they carry — both already
          pigments this file draws with, so the panel needs no new ink. */}
      <div className="min-w-0 flex-1 self-stretch overflow-hidden rounded-xs bg-[#161310] px-2 py-0.5">
        <code className="block whitespace-pre font-mono text-[7px] leading-[1.4] md:text-[8px]">
          {EMITTED_INSTANCES.map((instance) => (
            <span key={`${instance.mark}${instance.name}${instance.detail}`} className="block">
              <span className="text-[#6F675E]">{instance.mark}</span>
              <span className="text-[#FFFDF7]">{instance.name}</span>
              {instance.detail ? (
                <span className="text-[#8B9BFF]">{instance.name ? ' ' : ''}{instance.detail}</span>
              ) : null}
            </span>
          ))}
        </code>
      </div>
    </IllustrationPanel>
  );
}

/**
 * The sub-agents the orchestrator drives, in the README's stage order.
 *
 * `y` is the row's centre in the 112-unit viewBox, spaced 24 apart from 20, so
 * the four rows sit symmetrically about the orchestrator box at y=56.
 *
 * Each label names the agent and the thing it is built on, both read off
 * github.com/Kaleb-kougl/video-pipeline: transcript discovery, content
 * generation via Gemini, character analysis over ChromaDB, and MP4
 * compilation. Not an impression of a pipeline — these are its actual stages.
 */
const PIPELINE_AGENTS = [
  { label: 'transcript discovery', y: 20 },
  { label: 'content · gemini', y: 44 },
  { label: 'character · chromadb', y: 68 },
  { label: 'compile · mp4', y: 92 },
] as const;

/**
 * video-pipeline — one orchestrator, four sub-agents.
 *
 * A graph rather than a strip, because that is the shape of the claim: the
 * three other cards draw a ring, two code panes and a popup, so a fan-out is
 * the one silhouette not already spent.
 *
 * Colors come through `currentColor` off `text-*` tokens rather than
 * `fill-*`/`stroke-*` utilities, matching the arrow SVGs elsewhere in this
 * file. The rect fills are `fill-white`, which is exactly `--color-surface`.
 */
function AgentOrchestratorDrawing() {
  return (
    <IllustrationPanel className="bg-panel">
      <svg
        viewBox="0 0 280 112"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        {/* Connectors first, so the boxes sit on top of their ends. */}
        {PIPELINE_AGENTS.map((agent) => (
          <path
            key={agent.label}
            d={`M94 56 C 116 56, 126 ${agent.y}, 148 ${agent.y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="text-control"
          />
        ))}

        {/* The orchestrator: the one ink-bordered box on the panel. */}
        <rect
          x={12}
          y={38}
          width={82}
          height={36}
          rx={7}
          stroke="currentColor"
          strokeWidth={1.25}
          className="fill-white text-ink"
        />
        <text
          x={53}
          y={53}
          textAnchor="middle"
          fill="currentColor"
          className="font-mono text-[8px] font-bold text-ink"
        >
          workflow
        </text>
        <text
          x={53}
          y={64}
          textAnchor="middle"
          fill="currentColor"
          className="font-mono text-[8px] font-bold text-ink"
        >
          orchestrator
        </text>

        {PIPELINE_AGENTS.map((agent) => (
          <g key={agent.label}>
            <rect
              x={148}
              y={agent.y - 9}
              width={120}
              height={18}
              rx={4}
              stroke="currentColor"
              strokeWidth={1}
              className="fill-white text-hairline"
            />
            <text
              x={158}
              y={agent.y + 3}
              fill="currentColor"
              className="font-mono text-[8px] text-body"
            >
              {agent.label}
            </text>
          </g>
        ))}
      </svg>
    </IllustrationPanel>
  );
}

/** Indeed Analytics Extension — the popup, as it appears over a campaign. */
function ExtensionPopupDrawing() {
  const row = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-3 px-2.5 py-1">
      <span className="font-mono text-[9px] text-body">{label}</span>
      <span className="font-mono text-[9px] font-bold text-success">{value}</span>
    </div>
  );

  return (
    <IllustrationPanel className="bg-panel px-4">
      <div className="w-full max-w-[212px] overflow-hidden rounded-xs border border-hairline bg-surface shadow-hairline">
        <div className="bg-badge-blue px-2.5 py-1.5">
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-badge-blue-ink">
            Campaign diagnostics
          </span>
        </div>
        {/* The second row is the résumé's own figure, not a decorative one:
            "Cut ad campaign troubleshooting time 20% for Customer Support."
            The card's copy now leads with it, so the picture does too. */}
        <div className="divide-y divide-hairline py-0.5">
          {row('One-click triage', 'ready')}
          {row('Troubleshooting time', '\u221220%')}
        </div>
      </div>
    </IllustrationPanel>
  );
}

const ILLUSTRATIONS: Record<WorkProjectId, ReactNode> = {
  'r3f-projectiles': <ProjectilePoolDrawing />,
  'roblox-css': <CssTranslationDrawing />,
  'video-pipeline': <AgentOrchestratorDrawing />,
  'analytics-extension': <ExtensionPopupDrawing />,
};

/* Written out in full so Tailwind's scanner sees every class it must emit. */
const BADGE_TONE: Record<WorkBadgeTone, string> = {
  lime: 'bg-badge-lime text-badge-lime-ink',
  blue: 'bg-badge-blue text-badge-blue-ink',
  neutral: 'bg-badge-neutral text-badge-neutral-ink',
};

export function WorkSection() {
  return (
    <section id="work" aria-labelledby="work-heading" className="w-full">
      <div className="mx-auto w-full max-w-5xl px-6 py-20 md:py-28">
        <p className="eyebrow">Selected work</p>

        <h2
          id="work-heading"
          className="mt-4 font-display text-[clamp(2.25rem,7vw,3.5rem)] leading-[1.05] tracking-display text-ink"
        >
          Things I&rsquo;ve shipped.
        </h2>

        <p className="mt-4 max-w-2xl text-lg text-body">
          Two npm packages, a multi-agent LLM pipeline, and tooling used inside Indeed.
        </p>

        <ul className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {WORK_PROJECTS.map((project) => (
            <li
              key={project.id}
              className="flex flex-col rounded-lg border border-hairline bg-surface p-5 shadow-card"
            >
              {ILLUSTRATIONS[project.id]}

              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="font-display text-xl tracking-display text-ink">
                  {project.name}
                </h3>
                <span
                  className={`rounded-pill px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${BADGE_TONE[project.badge.tone]}`}
                >
                  {project.badge.label}
                </span>
              </div>

              <p className="mt-3 grow text-[0.9375rem] leading-relaxed text-body">
                {project.description}
              </p>

              {project.links.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-1">
                  {/* Only this card has something live to run. */}
                  {project.id === 'r3f-projectiles' ? <ProjectileDemoLauncher /> : null}

                  {project.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      /* min-h-11 = 44px: the tap target, not just the text. */
                      className="inline-flex min-h-11 items-center gap-1 rounded-xs text-sm font-semibold text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
                    >
                      {link.label}
                      <span className="sr-only">
                        {link.screenReaderSuffix} (opens in a new tab)
                      </span>
                      <span aria-hidden>→</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-4 flex min-h-11 items-center border-t border-hairline font-mono text-xs text-muted">
                  {project.linkNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
