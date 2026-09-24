/**
 * ProcessSection — "HOW THIS SITE IS BUILT".
 *
 * Server component: static copy, no state, no effects.
 *
 * HONESTY NOTE — read before editing the check rows below.
 * The four numbered steps describe the *intended* pipeline. The CHECKS panel
 * describes what is actually enforced today, and nothing more. Rows marked
 * `pending` are aspirational, and their values are stated as targets, never as
 * measurements. Do not put a KB figure or a draw-call count in a `pending`
 * row — flip it to `passing` and fill in the real number only once something
 * actually prints one.
 *
 * Three rows have been flipped since, and each `note` says exactly how far the
 * row's claim reaches:
 *   - `hero.glb` size is printed by `npm run hero:check`, which the
 *     `asset-budget` job in `.github/workflows/ci.yml` runs on every push and
 *     PR against the committed asset.
 *   - draw calls per frame are measured by `e2e/backdrop-renders.spec.ts`,
 *     which counts `drawArrays*`/`drawElements*` on the WebGL2 prototype and
 *     animation frames over the same window, so the row is a ratio and not a
 *     raw count. `scripts/check-hero-budget.mjs` still cannot do this: it can
 *     only prove the asset *permits* one draw call (112 nodes, one shared
 *     mesh, one shared material), never that the scene honours it.
 *
 *     The row reads `in (0, 10]` rather than `of 10 budget` for a reason, and
 *     the reason is a bug this page shipped with. The backdrop spent a while
 *     drawing nothing at all — react-three-fiber never got the measurement it
 *     needs to create its root, so the canvas sat at 300x150 and no frame was
 *     ever issued — and the budget stayed green throughout, because a ceiling
 *     is satisfied most comfortably by zero. Do not restate this as a maximum.
 *   - the mid-range phone was `not yet tested` until `npm run test:vitals`
 *     existed to test it: `e2e/midrange-phone.spec.ts` under Lighthouse's
 *     mobile emulation, against a production build, in the `web-vitals` CI
 *     job. The figures quoted are a local run of it. It is an emulation, the
 *     `note` says so, and it stays saying so — "mid-range phone" without that
 *     qualifier claims a handset nothing in this repo has ever touched.
 */

type CheckStatus = 'passing' | 'pending';

interface PreviewCheck {
  /** What is being checked. */
  name: string;
  /** The result today, or the budget it is aiming at if still pending. */
  value: string;
  status: CheckStatus;
  /** Where a figure came from, when that is not "a job in this pipeline". */
  note?: string;
}

/**
 * Every row below maps to a real step in `.github/workflows/ci.yml`, to a
 * measurement taken outside it (and labelled as such), or to a step that does
 * not exist yet (pending).
 */
const PREVIEW_CHECKS: PreviewCheck[] = [
  // --- Enforced today, on every pull request. ---------------------------
  { name: 'lint', value: 'npm run lint', status: 'passing' },
  { name: 'unit tests', value: 'npm run test:unit', status: 'passing' },
  { name: 'production build', value: 'npm run build', status: 'passing' },
  // NOT "+ visual snapshots": `e2e/visual-regression.spec.ts` skips itself in
  // CI (its baselines are macOS-only), so the snapshots are a local check.
  { name: 'end-to-end', value: 'npm run test:e2e', status: 'passing' },
  { name: 'hero.glb size', value: '8.5 KB of 500 KB budget', status: 'passing' },
  {
    name: 'homepage JS',
    value: '161.2 KB gzip, ≤ baseline + 1 KB',
    status: 'passing',
    note: 'every <script src> in the prerendered page; the lazy 3D scene is not counted',
  },
  {
    name: 'mid-range phone',
    value: 'LCP 0.8s, CLS 0.00',
    status: 'passing',
    note: 'emulated: 4× CPU, 1.6 Mbps, production build — not a physical handset',
  },

  {
    name: 'draw calls per frame',
    value: '1.00, in (0, 10]',
    status: 'passing',
    note: 'asserted as a range, not a ceiling — a blank canvas passes "≤ 10"',
  },
];

interface ProcessStep {
  title: string;
  line: string;
}

const STEPS: ProcessStep[] = [
  { title: 'Design', line: 'Sketch each section and what the blocks should do there.' },
  { title: 'Build in Blender', line: 'A Python script generates the blocks and exports hero.glb.' },
  {
    // NOT "with a still-image fallback". There is no still image: the only
    // asset it could point at does not exist (`STILL_AVAILABLE` is false in
    // `viewport-fallback.tsx`), and `morph-canvas.tsx` deliberately renders
    // nothing when WebGL is unavailable, because the backdrop is decoration
    // and an error card in its place would be worse than its absence. Say the
    // thing the code does.
    title: 'Animate on the web',
    line: 'React Three Fiber moves the parts on scroll. Without WebGL the page simply drops it.',
  },
  {
    title: 'Verify',
    line: 'Playwright captures each section; budgets guard file size and draw calls.',
  },
];

/** The mockup fills the second badge. Purely decorative emphasis — the circle
 *  is aria-hidden, so it never claims that step is "done" to a screen reader;
 *  the surrounding <ol> carries the real numbering. */
const FILLED_STEP_INDEX = 1;

/* Panel palette (`.pipeline-checks`, src/styles/blocks/pipeline-checks.css). Scoped to the
   dark checks panel only: #161310 is the `ink` token used as a surface,
   #EDE8DA is its paper-toned text (14.99:1). `lime` and `cta` appear there as
   the pass/pending marks — 6.00:1 and 13.76:1 on this surface — which is the
   one place the section spec calls for them outside their usual one-job
   contract. */

export function ProcessSection() {
  return (
    <section id="process" className="section">
      <div className="section__inner">
        <p className="eyebrow">HOW THIS SITE IS BUILT</p>

        <h2 className="section__heading mt-5 max-w-[18ch] md:text-[52px]">
          The background is a Blender file.
        </h2>

        <p className="mt-6 max-w-[62ch] text-base leading-relaxed text-body">
          Each block is a named part with its own pivot, generated by a Python script. The page
          moves those parts as you scroll, and every preview deploy checks them against a budget.
        </p>

        <ol className="mt-12 grid gap-7 md:mt-14">
          {STEPS.map((step, index) => (
            <li key={step.title} className="process-step">
              <span
                aria-hidden="true"
                className={
                  index === FILLED_STEP_INDEX
                    ? 'process-step__number process-step__number--filled'
                    : 'process-step__number'
                }
              >
                {index + 1}
              </span>
              <div className="pt-1">
                <h3 className="process-step__title">{step.title}</h3>
                <p className="process-step__text mt-1.5 max-w-[58ch]">
                  {step.line}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* --- What CI actually runs ---------------------------------- */}
        <div className="pipeline-checks mt-12 md:mt-14">
          <div className="pipeline-checks__header">
            <span className="pipeline-checks__title">Checks on every preview</span>
            <span className="pipeline-checks__source">GitHub Actions</span>
          </div>

          <ul className="pipeline-checks__list mt-4">
            {PREVIEW_CHECKS.map((check) => {
              const passing = check.status === 'passing';

              return (
                <li
                  key={check.name}
                  className="pipeline-checks__item"
                >
                  <span
                    aria-hidden="true"
                    className={
                      passing
                        ? 'pipeline-checks__mark pipeline-checks__mark--pass'
                        : 'pipeline-checks__mark pipeline-checks__mark--pending'
                    }
                  >
                    {passing ? '✓' : '✗'}
                  </span>
                  <span className="pipeline-checks__name">
                    {check.name}
                    <span className="sr-only">{passing ? ' — passing' : ' — pending'}</span>
                    {check.note ? (
                      <span className="pipeline-checks__note">
                        {check.note}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={
                      passing
                        ? 'pipeline-checks__result pipeline-checks__result--pass'
                        : 'pipeline-checks__result pipeline-checks__result--pending'
                    }
                  >
                    {check.value}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* --- Why the fit checker has no model --------------------------
            Sources: evals/local/results/2026-09-23-summary.md (8 fixtures) and
            2026-09-24-summary-v2.md; held-out numbers are in the commit message
            of the v2 experiment (the postings themselves are not in the repo). */}
        <div className="mt-12 md:mt-14">
          <h3 className="font-display text-lg leading-tight text-ink">
            The fit checker ships without a model.
          </h3>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-body-soft">
            I tested on-device language models (0.3–1 GB downloads) against plain code, first on 8
            job descriptions, then on 12 real postings the rules had never seen, labelled
            independently. Asked to read whole postings, the models lost badly. Redesigned to answer
            only the yes/no questions code was unsure about, they matched code within noise, which
            doesn&rsquo;t justify the download. So{' '}
            <a href="/fit" className="font-semibold text-ink underline underline-offset-4">
              the fit checker
            </a>{' '}
            runs no model: it is instant, works on every device, and the job description never
            leaves the page. A small on-device chat bot went through the same test and was dropped
            too: its answers read well but embellished in ways no automatic check could catch.
          </p>
        </div>
      </div>
    </section>
  );
}
