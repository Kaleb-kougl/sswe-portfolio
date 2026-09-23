# Portfolio AI features: implementation plan (v2)

2026-09-23 · refined from "Portfolio AI Features Implementation Plan.docx" against the repo as it stands on `scroll-redesign` (13ebc38).

## What changed from v1

| v1 said | Repo reality | v2 does |
|---|---|---|
| `content/`, `lib/`, `app/`, `pnpm` | `src/` layout, npm (`package-lock.json`) | `src/data/`, `src/lib/`, `src/app/`, `npm run …` |
| "Is it Next.js App Router on Vercel?" | Yes: Next 16.2.7, React 19.2, `@vercel/speed-insights` | Closed. Next 16 has breaking changes: read `node_modules/next/dist/docs/` before each new route handler (AGENTS.md) |
| Build the corpus from scratch | `src/data/resumeData.ts` (17 entries, 34 records) and `workProjects.ts` (4 cards, with a `verified` sourcing rule) already drive the site | Phase 0 turns existing bullets into `Evidence` records, with no new copy |
| `send_message` via Resend | Contact goes through Formspree with reCAPTCHA v3. Formspree rejects posts with no browser token, and Resend needs a verified domain the site doesn't have (`docs/contact-delivery.md`) | **Dropped from v1 of the MCP server.** `get_profile` returns the email and contact-form link |
| MCP `check_fit` calls our model | The calling agent is already an LLM | **No model calls behind MCP.** Agents get the corpus and search tools and do the reasoning themselves. Our spend is limited to the `/fit` web route |
| "Process page", "8.5 KB asset budget", "like your Core Web Vitals comment" | Process is a **section** on the one page. 8.5 KB is hero.glb's *size* against a **500 KB** budget. The vitals job is pass/fail and posts no PR comment | The eval PR comment is new work. AI rows join `PREVIEW_CHECKS` in `process-section.tsx` |
| "Homepage JS size unchanged in CI" | No JS bundle gate exists | Add one in Phase 2 before `/fit` ships (see below) |
| "Playwright snapshots pass with no diff" | `ci.yml` **auto-regenerates and commits snapshots on failure**, so a diff never fails CI | Phase 0 and Phase 2 PRs must show no auto-snapshot commit. Better: stop auto-committing on PRs (see Phase 0) |
| Turnstile / BotID on `/api/fit` | reCAPTCHA v3 is already on the page, but its secret lives only in Formspree, so this server can't verify tokens | Either add `RECAPTCHA_SECRET_KEY` to Vercel env and verify in the guard, or use Vercel BotID. Decide in Phase 2 |

## Scope

Three features, one foundation, about 3 weekends:

1. **MCP server + `/llms.txt`**: recruiters' agents can query the portfolio. No model calls, no write tools.
2. **JD fit checker (`/fit`)**: paste a job description and get requirement-by-requirement evidence and honest gaps. The only feature that spends money.
3. **AI eval gates in CI**: accuracy, latency and cost are budgets, shown in the Process section next to the hero budget and vitals.

Non-goals are unchanged: no chat assistant, no embeddings or vector DB, no accounts, and no stored JDs. Also out of scope for now: `send_message` (see Open questions).

## Architecture

```
Visitor ─▶ /fit (lazy page) ─▶ /api/fit ─▶ guard ─▶ fit pipeline ─▶ model provider
                                                        │
Agent ─▶ /api/mcp (stateless) ─▶ read tools ────────────┤
                                                        ▼
CI evals ─────────────────────────────────▶ src/lib/tools + src/data/corpus
```

- `src/lib/tools/*` are plain functions with Zod inputs, used by MCP, `/api/fit` and the eval runner. CI tests the same code visitors hit.
- The guard sits only in front of `/api/fit`. MCP gets a cheap per-IP rate limit because it costs CPU but no tokens.

**Dependencies to add:** `zod`, `ai` + one provider package, `mcp-handler` (fall back to `@modelcontextprotocol/sdk` if it lags Next 16), `@upstash/ratelimit` + `@upstash/redis`.

**Layout:**

| Path | Holds |
|---|---|
| `src/data/corpus/` | `evidence.ts`, `skills.ts` (tags + aliases), `profile.ts`, and `index.ts` exporting the validated corpus |
| `src/lib/tools/` | One file per tool: Zod input + handler |
| `src/lib/fit/` | Prompt, FitReport schema, grounding filter, coverage math |
| `src/lib/guard.ts` | Rate limit, spend cap, input limits, bot check |
| `src/app/api/mcp/[transport]/route.ts` | MCP server |
| `src/app/api/fit/route.ts` | Streaming fit endpoint |
| `src/app/fit/page.tsx` | Fit UI, its own route so the homepage bundle is untouched |
| `src/app/llms.txt/route.ts`, `src/app/llms-full.txt/route.ts` | Generated from the corpus, statically rendered |
| `evals/` | Cases, graders, runner, `thresholds.json`, `rubric.md` |

## Phase 0: corpus (no visible change)

Move facts into typed `Evidence` records with stable IDs. **The site must render byte-for-byte the same.**

```ts
const Evidence = z.object({
  id: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/), // "indeed-sr-swe.onehost"
  entry: z.string(),              // existing fileId or WorkProjectId it came from
  claim: z.string(),              // one factual first-person sentence
  skills: z.array(z.string()),    // canonical tags from skills.ts only
  metric: z.string().optional(),
  source: z.object({ label: z.string(), href: z.string().url() }),
  period: z.string().optional(),
});
```

Steps:
1. Split each `RESUME_DATA` bullet and each `WORK_PROJECTS` card into 1–3 records. The ID prefix is the existing `fileId`, so records trace back to today's data. **Keep `workProjects.ts`'s rule: every metric needs a checkable source.** `ROBLOX_CSS_COVERAGE` stays the single source for those numbers, and records reference it rather than retyping it.
2. `skills.ts`: canonical tags plus aliases (`mfe` → `module-federation`, `a11y` → `wcag`, `r3f` → `react-three-fiber`). Derive `SKILLS` (used in JSON-LD `knowsAbout`) from it.
3. `profile.ts`: role targets, availability, and preferred contact, derived from `CONTACT_INFO` rather than duplicated. **Decide whether the phone number goes to agents.** It's already public in JSON-LD, but `llms-full.txt` makes it trivially harvestable.
4. Rewire `career-section.tsx` and `work-section.tsx` to read from the corpus, or keep them on the current data and derive the corpus from it. **Pick derive-from-existing if the rewire gets messy.** The goal is one source of truth, whichever direction it flows.
5. Vitest `__tests__/corpus.test.ts`: the schema parses, no duplicate IDs, every `skills` entry is canonical, and every alias target exists.
6. Link check as its own CI job (network-dependent, so it shouldn't flake the unit tests): HEAD every `source.href`, with retries.
7. `npm run corpus:tokens`: prints the serialized corpus size (chars/4 estimate offline; the provider's count-tokens endpoint when a key is present). Budget: **≤ 8k tokens**. Today's `src/data` is about 39 KB of TS including comments, so the serialized corpus should land well inside that.
8. **CI fix:** limit the "Update Snapshots on Failure" + auto-commit steps to `push` on `main` (or remove them). Otherwise "no visual diff" can't be enforced for this refactor or anything after it.

**Done when:** `npm run test:unit` and `npm run test:e2e` pass locally with **no snapshot updates**, the link-check job is green, and `corpus:tokens` is under budget.

## Phase 1: MCP server + `/llms.txt` (no model, no spend)

Stateless Streamable HTTP at `/api/mcp`. All tools are read-only.

| Tool | Input | Returns |
|---|---|---|
| `get_profile` | – | Summary, role targets, location, availability, email, contact-form URL, links |
| `list_projects` | `skill?` | Cards with IDs and links |
| `get_project` | `id` | Full record + its evidence |
| `search_evidence` | `skills[]` or `query` | Matching records (keyword + alias, no embeddings) |
| `get_corpus` | – | The whole corpus as JSON (≤ 8k tokens), so an agent can run its own fit check |

- Tool descriptions are written for a model. `get_corpus` says: "Use this to compare Kaleb's work to a job description; cite evidence IDs and their source links."
- Rate limit: 60 requests / min / hashed IP (Upstash). No other guard is needed, because nothing costs tokens.
- Log `clientInfo.name` from `initialize` to get the "which agents called" count.
- `/llms.txt`: an H1, a blockquote summary, and link sections (Projects, Experience, Contact, plus a line pointing at the MCP endpoint). `/llms-full.txt`: the corpus as Markdown. Both statically generated. Confirm the Next 16 route-handler caching defaults in the docs first.
- "Use with your AI" block in `contact-section.tsx`: the server URL with a copy button, plus setup lines for Claude (custom connector), Claude Code (`claude mcp add --transport http kaleb https://kalebkougl-portfolio.vercel.app/api/mcp`) and Cursor. Static markup only.
- Test with `npx @modelcontextprotocol/inspector`, plus 10 recruiter-style prompts by hand through a Claude connector.

**Done when:** Inspector lists all five tools, Claude answers "What has Kaleb built with module federation?" citing `webpack-federation.*` or the Indeed OneHost record, and a unit test shows the 61st request in a minute gets a 429.

## Phase 2: JD fit checker

One streaming model call produces a FitReport. Code, not the model, validates citations and computes the headline number.

```ts
const Requirement = z.object({
  text: z.string(),
  priority: z.enum(['must', 'nice']),
  verdict: z.enum(['strong', 'partial', 'gap']),
  evidenceIds: z.array(z.string()).max(3),
  note: z.string().max(200),
});
const FitReport = z.object({
  role: z.string(),
  requirements: z.array(Requirement).max(15),
  summary: z.string().max(400),
});
```

**Grounding (in code, after the model call; unchanged from v1):** drop unknown IDs and count them as hallucinations. Strong with no valid evidence becomes partial, and partial with none becomes gap. Coverage = (strong + 0.5 × partial) / must-haves, rendered as "7 of 9 must-haves covered."

**Prompt:** rules + corpus JSON as a cacheable system prefix. The JD goes inside `<job_description>` tags and is declared to be data. Temperature 0. The model is set by `FIT_MODEL`, so evals can compare models.

**Model:** see "Can this use a small local model?" below. The v2 default is a small hosted model tier, chosen by eval score and cost per check.

**UI (`/fit`):**
- Its own route, so the homepage bundle is unaffected by construction. The hero gets only a plain `<Link>`.
- Rows stream in grouped by Must-have / Nice-to-have, with verdict badges and evidence chips that link to anchors, npm or commits.
- Gap rows read "Not in my work yet. Closest: …", unsoftened.
- An `aria-live="polite"` summary line announces progress per row, not per token. Respect reduced motion and make everything keyboard-operable.
- "Copy as Markdown", and "Email me about this role", which opens `/#contact` with the Reason pill set to "Full-time role" and a prefilled message. The JD itself isn't forwarded.
- Budget message: "The fit checker is resting until tomorrow" + a mailto when the cap is hit.

**New CI gate (land it before `/fit`):** after `next build`, a script sums the homepage's first-load JS from the build manifest and compares it to a committed `budgets/homepage-js.json`. Fail at +1 KB. It gets its own `PREVIEW_CHECKS` row once it runs.

**Done when:** 5 real JDs (frontend, design engineer, AI platform, poor match, non-engineering) give reports you'd defend; the homepage JS gate is unchanged; and a Playwright snapshot of a finished report from a **recorded** response is stable. The route reads a fixture when `FIT_FIXTURE` is set, so e2e never calls the provider. Per the dev-server memory, stop `next dev` before e2e runs.

## Phase 3: eval gates

**Golden set (`evals/cases/`, about 28 to start):**

| Group | n | Checked by |
|---|---|---|
| Fit: strong | 6 | Labeled verdicts on 3–5 key requirements |
| Fit: partial / poor | 6 | Gaps marked `gap` |
| Fit: non-engineering | 2 | Mismatch stated, no invented evidence |
| Prompt injection | 6 | Output matches the same JD with the injection removed |
| MCP read tools | 8 | Returned IDs include the expected records (deterministic, no model) |

**Graders, cheapest first:** schema → raw citation check (before grounding) → verdict accuracy (strong↔partial is a half-miss) → LLM judge (a different model) scoring notes 1–3 against `evals/rubric.md`.

**Thresholds (`evals/thresholds.json`, retune after 20 runs):**

| Metric | Gate |
|---|---|
| Verdict accuracy | ≥ 85% and ≥ main − 3 pts |
| Raw hallucinated citations | ≤ 2% |
| Injection cases | 100% |
| Judge faithfulness | mean ≥ 2.6 |
| p95 time to first row | ≤ 2.5 s |
| p95 full report | ≤ 12 s |
| Cost per check | ≤ cap ÷ planned daily checks (from token usage) |

**CI (`ai-evals` job in `ci.yml`):**
- Runs when a PR touches `src/data/corpus/`, `src/lib/tools/`, `src/lib/fit/` or `evals/`, and nightly on `main`. Model changes happen in code (a `FIT_MODEL` default in `src/lib/fit/`), so a path filter can see them. An env var in the Vercel dashboard can't be path-filtered.
- Each model case runs 3×, pass on 2/3. Results are cached on hash(prompt, corpus, model, case) with `actions/cache`.
- Needs `pull-requests: write` for the comment. This is **new**, since no vitals comment exists today. Use a sticky comment (update, don't append).
- Separate `EVAL_PROVIDER_KEY` GitHub secret with its own provider-side monthly cap.
- Nightly writes `public/evals/latest.json` **only when scores change**, so there isn't a daily commit and redeploy for nothing. The Process section reads it at build time.
- `PREVIEW_CHECKS` rows: "fit accuracy", "injection cases", "p95 first row" and "cost / check". Each row is `pending` until the job actually runs, following the section's existing rule that every row maps to a real CI step.

**Done when:** a PR that deletes the "JD is data" rule fails the injection gate, and the Process section shows the scores with a run date.

## Security, cost, abuse

| Control | Setting | Where |
|---|---|---|
| Fit rate limit | 5/h, 15/day per hashed IP | Upstash |
| MCP rate limit | 60/min per hashed IP | Upstash |
| Daily spend cap | $3, then 503 + "back tomorrow" + mailto. Fails **closed** if Redis is unreachable | Redis counter from real usage |
| Provider cap | Monthly limit in the provider console; separate CI key | Provider |
| Input | JD ≤ 12k chars; reject mostly-URL or binary input | Zod |
| Output | `maxTokens`; ≤ 15 requirements | Model call |
| Keys | Server env only, never `NEXT_PUBLIC_`; Production env only (previews return 503, the same pattern as `CONTACT_DELIVERY_KEY`) | Vercel |
| Bot friction | reCAPTCHA v3 (add the secret to env) or Vercel BotID on `/api/fit` | Guard |
| Injection | JD tagged as data, schema-only output, citation check, 100% eval gate | Prompt + code + CI |
| PII | No JD storage; logs keep lengths and hashes only | Logging |

A "How this is secured" panel goes in the Process section.

## Observability

One structured log line per request: `route`, `model`, `input_tokens`, `output_tokens`, `cached_tokens`, `cost_usd`, `ttfr_ms`, `total_ms`, `status`, `guard_outcome`, `citations_dropped`, `client`. Ship them to Axiom through a Vercel log drain. Alerts: spend > 80% of the cap, and nightly eval failure (GitHub already emails on a failed scheduled run, so that one is free).

SLOs (28-day): fit success ≥ 99% excluding cap hits, p95 time to first row ≤ 2.5 s, dropped citations ≤ 2%.

## Can this use a small local model?

Partly. It depends on where "local" is.

| Where it runs | Works? | Trade-off |
|---|---|---|
| **Behind MCP** | Not needed | The calling agent is the model. v2 already does this: zero model cost |
| **In the visitor's browser** (WebLLM / transformers.js on WebGPU, a 1–3B model at 4-bit) | Feasible as an opt-in mode | **Pros:** no API cost, no key, no spend cap, and the JD never leaves the device, which is a strong privacy story. **Cons:** a download of roughly 1 GB or more. WebGPU isn't universal, and mid-range phones (the device the vitals job targets) will struggle. Prefilling an ~8k-token corpus plus the JD on an integrated GPU likely takes well over the 2.5 s first-row SLO. Small models are weakest at exactly what this feature needs: long-context grounding and strict JSON. That's the "oversells you" risk |
| **Self-hosted server** (Ollama on a VPS or home box) | Not on Vercel | Vercel functions have no GPU, so this means a separate box to run and secure. At portfolio traffic that costs more than a hosted small model, and it adds an uptime dependency |
| **CI evals** | Only if production uses it too | Evaluating a different model than the one you ship proves nothing |

**How to make a small model viable:** shrink its job. Have the model only **extract requirements** from the JD (`{text, priority, skills[]}`), a short, easy task. Then let deterministic code map skills to evidence through the alias table and assign verdicts: strong means ≥ 2 matching records or 1 with a metric, partial means 1, gap means 0. The model never sees the corpus, so it can't hallucinate a citation. The prompt is about 3k tokens instead of 11k, and the verdict logic becomes unit-testable. What you lose is nuance: "partial" gets mechanical, and notes become templates.

**Recommendation:** ship v1 on a small hosted model with the full prompt, because it has the best chance of clearing 85% accuracy. Build the eval suite so the extraction-only pipeline can be scored as a second contender. If extraction-only plus a hosted model scores close, that's the cheaper design anyway. If it holds up, a browser "private mode" becomes a Weekend 4 experiment (gating below).

### Private mode: optional, and never on devices that can't run it

The hosted path is always the default and always works. The local model is something a visitor opts into. It is never auto-loaded, never prefetched, and never on the homepage.

**Load boundary.** The runtime (WebLLM or transformers.js) sits behind a dynamic `import()` inside the Private-mode handler on `/fit`. Until that button is pressed, the page ships zero bytes of it. The homepage JS gate (Phase 2) and a `/fit` first-load check keep it that way.

**Gating follows `morph-canvas.tsx`: no guessing from hardware hints; hard requirements first, then measure.** `navigator.deviceMemory` and `hardwareConcurrency` are not used, for the reason that file records: the first is missing on iOS Safari and the second counts CPU cores, not GPU throughput.

| Step | When | Rule | If it fails |
|---|---|---|---|
| 1. Hard requirements | On `/fit`, at idle after `load` (see Threading) | `navigator.gpu` exists; `requestAdapter()` returns an adapter; adapter limits (`maxBufferSize`, `maxStorageBufferBindingSize`) fit the model's largest weight buffer | No button. Hosted only, and nothing tells the visitor they're missing out |
| 2. Stated preferences | On page load | `useSaveData()` is false (reuse the existing hook) | Button shown but disabled: "Private mode is off because Data Saver is on." |
| 3. Storage | When the button is pressed | `navigator.storage.estimate()` shows room for the model plus a margin | "Not enough storage for the ~1 GB model." Stay hosted |
| 4. Consent | When the button is pressed | Dialog states the download size, that it's cached for next time, and that the JD stays on the device | Cancel means hosted |
| 5. Microbenchmark | Before the download | About 200 ms of WebGPU matmuls sized like the model's layers, turned into an estimated time to first row for a ~3k-token prompt | Estimate > 10 s: "This device would take about N s. Use the standard checker?" Default to hosted, with an override |
| 6. Runtime watchdog | During inference | Measured prefill tokens/s. If time to first row passes 15 s, stop | Abort, then offer a hosted retry *with* consent (the JD would leave the device). Latch "too slow" in `sessionStorage` so the button is disabled for the rest of the session |

**Threading: nothing heavy on the main thread, nothing during load.**

| Work | Where it runs | Why |
|---|---|---|
| Step 1 adapter probe | `requestIdleCallback` after the `load` event on `/fit` (with `setTimeout` as the fallback for Safari), never on the homepage. The button renders disabled ("Checking…") until the probe resolves, and its box is reserved so there's no layout shift | `requestAdapter()` is async but can start the GPU process. It must not compete with LCP |
| Steps 3–4 | Main thread; they're trivial | A storage estimate and a dialog |
| Step 5 benchmark, the download, cache writes, tokenizer, inference, JSON parsing, step 6 watchdog | **One dedicated Web Worker** (WebLLM's `WebWorkerMLCEngine`, or transformers.js in a worker), created when the button is pressed. Only `create*PipelineAsync` is used | Keeps the token loop, weight parsing and shader compilation off the main thread |
| Worker → UI | `postMessage` once per completed requirement row, never per token | React renders about 15 times per report, not hundreds |
| Hosted path | Streaming `fetch` on the main thread; partial-object renders throttled to one per animation frame | Small payload (≤ 15 rows), so no worker is needed |

Fallback: if WebGPU isn't exposed in workers on a browser (check support per browser at build time), that browser fails step 1 and gets no button. **Inference never falls back to the main thread.**

A worker frees the main thread, not the GPU. Heavy inference can still steal frames from the compositor on integrated GPUs. `/fit` has no 3D backdrop, and its UI is mostly static during a run, but this still gets measured: a Playwright test runs a local-model check and asserts INP ≤ 200 ms and no long tasks > 50 ms on the main thread (a `PerformanceObserver` on `longtask`), under the vitals job's mid-range profile.

Step 5 is the important one. The ~1 GB download is the expensive, irreversible part, so a device that can't run the model should find out *before* it spends that bandwidth. The benchmark only estimates, so step 6 is the backstop, the same way the frame watchdog backs up the backdrop.

**Measured, not assumed.** Before shipping, run a benchmark on the vitals job's emulated mid-range phone profile plus one real iPhone and one integrated-GPU laptop. Record the thresholds in the plan's Weekend 4 notes. The Process section only gets a Private-mode row once those numbers exist.

**Evals.** Private mode must pass the same golden set (via transformers.js in Node, on a small nightly subset because CPU inference is slow) before the button ships. Fail the gate and the button stays hidden.

## Milestones (about 26 h)

**Weekend 1: corpus + MCP (about 9 h)**
- ☐ Corpus schema, split records, skills and aliases, unit tests (3 h)
- ☐ Sections read from the corpus with no snapshot diff; restrict the CI snapshot auto-commit (2 h)
- ☐ Link-check job, `corpus:tokens` (1 h)
- ☐ Read tools + unit tests; `/api/mcp` + rate limit (2 h)
- ☐ `/llms.txt`, `/llms-full.txt`, Inspector + connector smoke test, "Use with your AI" block (1 h)

**Weekend 2: fit checker + eval harness (about 11 h)**
- ☐ Homepage JS budget gate (1 h)
- ☐ FitReport, prompt, grounding, guard, `/api/fit` streaming (3 h)
- ☐ 15 labeled cases + local runner with schema, citation and verdict graders (3 h)
- ☐ Tune to ≥ 85% locally; score extraction-only as a contender (1 h)
- ☐ `/fit` UI with fixture mode for e2e (3 h)
- ☐ Spend cap + provider cap set; hero link ships

**Weekend 3: CI gates + Process section (about 6 h)**
- ☐ Grow to about 28 cases incl. 6 injection; LLM judge (2 h)
- ☐ `ai-evals` job: path filter, 2/3, cache, sticky PR comment (2 h)
- ☐ Nightly `latest.json` (write-on-change); `PREVIEW_CHECKS` rows + security panel (1 h)
- ☐ Structured logs, Axiom drain, spend alert (1 h)

**Project done when:** a recruiter can use `/fit` or their own agent, every claim links to a source, and CI has blocked at least one deliberate regression.

## Open questions

- ☐ **Model provider:** pick by eval score and cost per check. The provider SDK is the only piece that changes.
- ☐ **Bot check:** add the reCAPTCHA secret to env (reuses the existing widget) or adopt Vercel BotID?
- ☐ **Phone number** in `get_profile` / `llms-full.txt`: include or omit?
- ☐ **`send_message` later?** Only if it's worth a second Formspree form without reCAPTCHA plus a per-IP limit. It's the only write tool and the largest abuse surface.
- ☐ **Browser private mode (Weekend 4)?** Only if extraction-only scores within about 5 points of the full prompt. It's opt-in and gated by hard requirements, a pre-download benchmark and a runtime watchdog (see "Private mode" above).

## Risks

| Risk | Mitigation |
|---|---|
| Fit checker oversells you | Code-level downgrades, gap rows always visible, poor-match cases in evals |
| Abuse drains the cap | Per-IP limits, a daily cap that fails closed, provider cap, bot check; MCP spends nothing |
| Eval flakiness gets ignored | 2-of-3, relative-to-main gate, retune after 20 runs |
| Snapshot gate silently auto-updates | Phase 0 step 8 |
| `mcp-handler` lags Next 16 | Tools are plain functions; swap to `@modelcontextprotocol/sdk` directly |
| Corpus goes stale | The site renders from it (or it derives from the site's data); the link check runs in CI |
