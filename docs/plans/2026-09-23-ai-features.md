# Portfolio AI features: implementation plan (v4)

2026-09-23 · refined from "Portfolio AI Features Implementation Plan.docx" against the repo as it stands on `scroll-redesign` (13ebc38).

**Status:** Phase 0 done (`919cdff`, `f1f95ab`, `fd7e84f`). Phase 1 done in code (`3fc1542`, `e4560ba`); it still needs the Vercel env vars and the live connector smoke test. **v3 (2026-09-23): the fit checker runs entirely in the visitor's browser.** No hosted model, no server spend, no `/api/fit`. **v4 (same day): code-first extraction.** The model only makes one grammar-forced decision per JD segment (Phase 2a). Phase 2 baseline: `b00cebc`, `6ecec7a`, `0dcc26c`. **Phase 2 result (same day): no on-device model beat code, so `/fit` ships code-only and Private mode is behind `NEXT_PUBLIC_FIT_PRIVATE_MODE` (off).** See 2f.

## What changed from v1

| v1 said | Repo reality | Now |
|---|---|---|
| `content/`, `lib/`, `app/`, `pnpm` | `src/` layout, npm (`package-lock.json`) | `src/data/`, `src/lib/`, `src/app/`, `npm run …` |
| "Is it Next.js App Router on Vercel?" | Yes: Next 16.2.7, React 19.2, `@vercel/speed-insights` | Closed. Next 16 has breaking changes: read `node_modules/next/dist/docs/` before each new route handler (AGENTS.md) |
| Build the corpus from scratch | `src/data/resumeData.ts` and `workProjects.ts` already drive the site | Phase 0 turned existing bullets into `Evidence` records, with no new copy |
| `send_message` via Resend | Contact goes through Formspree with reCAPTCHA v3; Resend needs a verified domain the site doesn't have (`docs/contact-delivery.md`) | **Dropped.** `get_profile` returns the email and contact-form link |
| MCP `check_fit` calls our model | The calling agent is already an LLM | **No model calls behind MCP.** Agents get the corpus and search tools |
| Fit checker on a hosted model behind `/api/fit` | – | **v3: browser-only.** A small model runs in a Web Worker on WebGPU and only *extracts* requirements. Code does all the matching and verdicts. Devices that can't run it get a deterministic skill scan. $0 to run; the JD never leaves the device |
| "Process page", "8.5 KB asset budget", "like your Core Web Vitals comment" | Process is a **section**. 8.5 KB is hero.glb's *size* against a **500 KB** budget. The vitals job posts no PR comment | The eval PR comment is new work. AI rows join `PREVIEW_CHECKS` in `process-section.tsx` |
| "Homepage JS size unchanged in CI" | No JS bundle gate existed | Added in Phase 0 (`scripts/check-homepage-js.mjs`) |
| "Playwright snapshots pass with no diff" | Snapshot PNGs are gitignored and the visual spec skips in CI | Visual snapshots are a local check. The CI auto-commit steps were removed |
| Turnstile / BotID / spend cap on `/api/fit` | – | **Not needed in v3:** there is no server endpoint that costs money |

## Scope

1. **MCP server + `/llms.txt`**: recruiters' agents can query the portfolio. No model calls, no write tools.
2. **JD fit checker (`/fit`)**: paste a job description and get requirement-by-requirement evidence and honest gaps, computed on the visitor's device.
3. **AI eval gates in CI**: extraction accuracy and on-device latency are budgets, shown in the Process section next to the hero budget and vitals.

Non-goals: no chat assistant, no embeddings or vector DB, no accounts, no stored JDs, no hosted model, and no telemetry about what visitors paste.

## Architecture

```
Visitor ─▶ /fit ─┬─ capable device ─▶ Web Worker (WebGPU model) ─▶ extraction ─┐
                 └─ everyone else ──▶ deterministic skill scan ─────────────────┤
                                                                               ▼
                                                      src/lib/fit (matching, verdicts, coverage)
                                                                               │
Agent ─▶ /api/mcp (stateless) ─▶ src/lib/tools ────────────────────────────────┤
                                                                               ▼
CI evals ──────────────────────────────────────────────────────▶ src/data/corpus
```

- The model's only job is to turn a JD into `{role, requirements: [{text, priority, skills[]}]}`. It never sees the corpus and never produces a verdict, so it can't invent a citation or oversell.
- `src/lib/fit/*` is pure TypeScript shared by the worker, the fallback and the eval runner. CI tests the same code visitors run.

**Layout:**

| Path | Holds |
|---|---|
| `src/data/corpus/` | Evidence, skills + aliases, profile, validated `CORPUS` |
| `src/lib/tools/` | MCP tools as plain functions |
| `src/lib/guard.ts` | MCP rate limit |
| `src/lib/fit/` | Extraction schema + prompt, matcher, verdicts, coverage, fallback scan, Markdown export |
| `src/lib/fit/local/` | Worker, runtime adapter, capability gate, benchmark |
| `src/app/api/mcp/route.ts` | MCP server |
| `src/app/fit/page.tsx` | Fit UI, its own route so the homepage bundle is untouched |
| `src/app/llms.txt/`, `src/app/llms-full.txt/` | Generated from the corpus, static |
| `evals/` | Cases, graders, runner, `thresholds.json` |

## Phase 0: corpus (done)

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

## Phase 1: MCP server + `/llms.txt` (done in code)

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


## Phase 2: JD fit checker, in the browser

**v4: code first, model last.** Code finds everything it can deterministically. The model makes one small, grammar-forced decision per JD segment, and code judges. In the first real run, a model asked to extract requirements freely dropped 3 of 5 and mapped "Go or Kubernetes" to `html`. Letting code enumerate the requirements makes skipping impossible, and every step except the model's decision is exact and the same on every device.

### 2a. Extraction pipeline (`src/lib/fit/`; types in `contract.ts`)

| Step | Who | How |
|---|---|---|
| 1. Segment | Code | Split into bullets and lines, and sentences for prose. Strip bullet markers. The text stays verbatim, never paraphrased |
| 2. Section → priority | Code | Header lexicon: requirements/qualifications → `must`; nice to have/preferred/bonus → `nice`; responsibilities → no priority; about/benefits/EEO → never a requirement; anything else → `unknown`. Inline cues ("preferred", "a plus", "bonus") override to `nice` |
| 3. Skills | Code | `detectSkills` (the alias scan) plus the gap vocabulary, per segment |
| 4. Years | Code | Regex: "5+ years", "at least five years", "3-5 years" (takes the minimum) |
| 5. Role | Code | Title heuristics (first short line, "Job title:", "We're hiring a …"); otherwise "Role not stated" |
| 6. Candidates | Code | Segments not in about/benefits, capped at `MAX_CANDIDATES` = 40 |
| 7. Decide | **Model** | Per candidate, in order: `{requirement: bool, priority, addSkills[]}`. The grammar is built per run with **exactly N items**. `addSkills` is limited to canonical IDs, and code's findings can't be removed. `priority` is used only where code's was null |
| 8. Merge | Code | Kept segments → `ExtractedRequirement[]` (text = segment text; skills = code ∪ model's additions; priority = code's, else the model's) |
| 9. Judge | Code | Unchanged: per-skill verdicts, evidence, coverage |

**`defaultDecision` (no model, the "scan" mode):**
- A requirements/preferred segment is kept if it names a skill or years, or isn't just a blurb.
- A responsibilities segment is kept as `nice` only if it names a skill.
- An unknown-section segment is kept only if it names a skill, with priority null, so it's left out of coverage.

Same `FitReport`. Coverage is shown whenever the JD had recognisable sections.

**Prompt:** a short rules block, the canonical vocabulary (id: names), and the numbered candidate segments inside `<job_description>` tags, declared to be data. The model sees only segment text, never evidence.

**Determinism:** greedy decoding plus the grammar gives the same output for the same input on a given device. Across GPUs, float differences can rarely flip a decision. Because code's findings are a floor, a flip can only add or drop a model-added skill or a keep/drop call, never a code-found skill.

### 2b. Deterministic judging (pure, fully unit-tested)

- **Evidence** for a requirement = corpus records sharing any of its `skills`, ranked by skill overlap, then records with a metric first; keep the top 3.
- **Verdict:**
  - `strong`: ≥ 2 matching records, or 1 with a metric
  - `partial`: 1 matching record without a metric
  - `gap`: no matching records, but the requirement names skills (`skills` or `otherSkills`)
  - `not_assessed`: names no skills (for example "excellent communication"). Shown, but excluded from coverage
- **Years:** when `minYears` is set, compare it to years since `CAREER_START_YEAR`, stated in the note either way.
- **Coverage** = (strong + 0.5 × partial) / must-haves, rendered as "7 of 9 must-haves covered".
- **Notes are templates:** "Evidence: OneHost migration (Indeed), …", or for gaps "Not in my work yet. Closest: …", where "closest" means records sharing a skill *category*. Unsoftened.
- **Injection can't upgrade anything:** the worst a hostile JD can do is add or drop extracted requirements. Verdicts are computed from the corpus.

### 2c. No-model path

Devices that can't run the model get steps 1–6, 8 and 9 with `defaultDecision`. That gives real requirement rows with must/nice from headers, the gap vocabulary for "mentioned, not in my work", and coverage when sections were recognised. `SCAN_DISCLAIMER` states the limits: engineering terms only, and priorities only from headers.

### 2d. Local runtime (`src/lib/fit/local/`)

- **Runtime:** WebLLM (MLC) in a dedicated worker (`WebWorkerMLCEngine`), for its JSON-schema-constrained decoding (XGrammar). transformers.js is the fallback if WebLLM's worker or schema support disappoints.
- **Model:** chosen by the Phase 3 evals from WebLLM's prebuilt list. Start with a ~1–1.5B instruct model at 4-bit (roughly 1 GB). Pin the exact model id and revision in code.
- **Weights host:** WebLLM's default (Hugging Face CDN). Vercel isn't suitable for 1 GB of static weights. The consent dialog says the model downloads from Hugging Face, which sees an IP address but never the JD. The weights are cached in the browser's Cache Storage, so the next visit is instant.
- **Gating and threading:** as in "Private mode" below. Opt-in only, hard requirements before offering, a pre-download benchmark, a runtime watchdog, and nothing heavy on the main thread.

### 2e. UI (`/fit`)

- Its own route; the homepage only gets a plain `<Link>`. The fallback scan is instant and runs first. The Private-mode button offers the model-based report.
- Rows grouped Must-have / Nice-to-have / Not assessed, each with a verdict badge and evidence chips linking to the source.
- The runtime's rows arrive as each requirement finishes (one worker message per row). An `aria-live="polite"` line announces progress per row. Respect reduced motion; everything keyboard-operable.
- Download progress as a real `<progress>` with bytes, cancellable.
- Actions: "Copy as Markdown", and "Email me about this role", which links to `/#contact` with the "Full-time role" pill preselected. The JD itself is never sent.

**Done when:**
- A unit test suite covers judging and the scan.
- An e2e test with a **mocked worker** (fixture extraction) produces a stable report.
- An e2e test asserts **no network request carries JD text** during a check.
- 5 real JDs (frontend, full stack, AI platform, poor match, non-engineering) give reports you'd defend on your own laptop.
- The homepage JS gate is unchanged.
- Main-thread long tasks stay ≤ 50 ms during a local run.

### 2f. Result: code beat every model; model + code v2 experiment

**Comparison (2026-09-23, `evals/local/results/2026-09-23-summary.md`):** 8 labelled JDs, 81 candidate segments, 70 requirements, run on this Mac's GPU in headless Chromium.

| | No model | Llama-3.2-1B | Qwen2.5-1.5B | Qwen3-1.7B |
|---|---|---|---|---|
| Download | 0 | 695 MB | 869 MB | 968 MB |
| Keep/drop accuracy | **93.8%** | 53.1% | 55.6% | 82.7% |
| Row agreement with the ideal report | **55/70** | 22/70 | 25/70 | 2/70 |
| Total time (median) | instant | 2.7 s | 7.7 s | 5.2 s |

With numbered items, the best model reached 29/70. Letting the model decide only headerless segments gained 1–3 rows on one JD. That's not worth a 0.7 GB download.

**Why it lost:**
- One long N-item generation: every model shifted skills by one segment (0 of 87 added skills were correct).
- Llama copied the prompt's example.
- The model was asked about every segment, including those code was certain about.

**Caveats:**
- The rules and the labels were written against the same 8 JDs, so code's score is optimistic.
- The 0% `addSkills` precision may be partly a prompt or scoring artefact: re-listing a skill code already found counts as an error.

**Decision:** ship `/fit` code-only. Private mode stays in the repo behind `NEXT_PUBLIC_FIT_PRIVATE_MODE=1`, which is off in production and on in e2e against a mocked worker. The Process section says why.

**v2 experiment (before turning the flag on):**
1. **A fair test set first:** 10–15 real JDs the rules have never seen, labelled independently (ideally by Kaleb), in `evals/cases/holdout/`. Code's score on these is the real bar.
2. **Ask only where code is unsure:** segments with no header, no skill found, or a possible intro/duty line. Code-certain segments never reach the model.
3. **One segment per call, one-token answer:** "Is this a requirement the candidate must meet? yes/no", constrained to a single token, reading the logprob (confirm WebLLM exposes `logprobs`). This removes the alignment failure. Try a smaller model too (Qwen2.5-0.5B, about 400 MB).
4. **Abstain unless confident:** override code only when the probability passes a threshold tuned on labelled JDs. At a high enough threshold it *is* code, so on the tuning set it can't score below code.
5. **Check skills instead of choosing them:** code proposes likely matches from a fuzzy lexical match against labels and aliases, and the model answers yes/no for each.
6. **Alternative for synonyms:** a tiny embedding model (about 25 MB, transformers.js) matches phrases to the vocabulary above a strict similarity threshold. It's deterministic and small enough to consider for everyone; it could also back better "Closest" links.
7. **Rules:** each variant is scored against code on the holdout set. The flag turns on only if one variant wins by a margin larger than the noise, and after re-checking the gate, bench and watchdog on real devices.

### 2g. Held-out result and the code-improvement loop

**Held-out rematch (2026-09-24):** 12 real postings, labelled independently (143 labels) by an agent that never saw the rules. Postings, labels and per-case results stay local and gitignored.

| | Download | Rows matching labels | Keep/drop correct | Spurious rows |
|---|---|---|---|---|
| Code only | 0 | **77/143** | **285/380** | 61 |
| v1 (one JSON answer), best | 695 MB | 67 | 180–225 | 127 |
| v2 routed yes/no, τ=0.9 | 278–869 MB | 77–78 | 282–286 | 61–64 |
| v2, fixture-tuned τ | 278–869 MB | 80–81 | 248–371 | up to 90 |
| Embedding matcher (skills) | 24 MB | – | – | 45 wrong additions (26% precision) |

- **Decision:** no model ships. Private mode stays off and the embedding matcher is unused by any page (commits `feat(fit): routed yes/no…`, `feat(fit): embedding…`).
- **What it showed:** code is much weaker on unseen postings (54% rows vs 79% on fixtures). Segmentation missed none of the 143 labels, so the losses come from keep/drop and priority. The gains are in code.

**Code-improvement loop, with the split declared before looking at per-JD results:**
- **Dev (6):** adobe, chalk, discord, sift, point-predictive, chai. These live in `evals/cases/holdout/` and may be read and tuned on.
- **Test (6):** conduit, upstart, linkedin, openai, ironclad, nvidia. These live in `evals/cases/holdout-test/`, **must not be read** by whoever changes the rules, and are scored once at the end by someone else.
- **Targets:**
  - fewer spurious rows (duty lines, intros, "what success looks like")
  - priority on ambiguous headings ("You might thrive if…")
  - plain word-form aliases ("mentored", "APIs", "Migrate")
- **Guard:** the fixtures' pinned baseline must not regress.
- **Rule:** a change ships if it improves dev without hurting fixtures, and the one-time test score is reported as is, good or bad.

## Phase 3: eval gates

**Golden set (`evals/cases/`, about 28):** the same groups as before: strong (6), partial/poor (6), non-engineering (2), injection (6), MCP read tools (8). Each fit case is labeled with its requirements (text, priority, skills) and expected verdicts for 3–5 key ones.

**Graders (v4):** the code steps are unit-tested exactly, so the evals judge the pipeline end to end and the model's added value separately:
- segmentation and priority: labeled requirement segments found (recall), priority accuracy; deterministic, must be 100% on the golden set
- model decisions: keep/drop accuracy per segment, and precision of `addSkills` (a wrong added skill is worse than a missed one)
- **model vs no-model delta:** end-to-end verdict accuracy with the model minus with `defaultDecision`. If the model doesn't beat the no-model path, it doesn't ship
- end-to-end verdict accuracy through the real `src/lib/fit` code
- injection cases: verdicts equal the clean JD's

There's no LLM judge, because notes are templates. That's one less model and one less source of noise.

**Running the model in CI (spike first, pick one):**
1. **Same weights, native runtime:** `node-llama-cpp` with the GGUF of the same model at the nearest quantization, plus the same JSON schema as a grammar. Fast on a CPU runner, but a proxy, and labeled as one.
2. **Same runtime:** Playwright Chromium with WebGPU on a software (SwiftShader) adapter, running the real worker. Exact, but possibly too slow for more than a handful of cases.

Decoding is greedy (temperature 0) and deterministic, so each case runs **once**, not 2-of-3. Results are cached by hash(prompt, vocabulary, model id, case).

**Thresholds (`evals/thresholds.json`, retune after 20 runs):**

| Metric | Gate |
|---|---|
| Requirement segments found (code) | 100% on the golden set |
| Verdict accuracy (end to end) | ≥ 85% and ≥ main − 3 pts |
| `addSkills` precision | ≥ 90% |
| Model vs no-model verdict accuracy | > 0 pts (the model must earn its download) |
| Injection cases | 100% |
| Scan-mode cases | 100% (deterministic) |

**Latency is measured on devices, not in CI.** CI runners have no representative GPU. `npm run fit:bench` runs a fixed JD through the real worker in a real browser and records time to first row, total time and tokens/s. Its results are committed to `evals/devices.json` for the reference laptop and phone. The Process section shows them labelled "measured on <device>, not in CI", following the mid-range phone row's precedent.

**CI job `ai-evals`:** runs on PRs touching `src/data/corpus/`, `src/lib/fit/` or `evals/`, and nightly on `main`. Sticky PR comment with each metric against main (needs `pull-requests: write`). Nightly writes `public/evals/latest.json` only when scores change. The Process section reads it at build time; rows stay `pending` until the job really runs.

**Done when:** a PR that deletes the "JD is data" rule fails the injection gate, and the Process section shows the scores with a run date.

## Security and privacy

| Concern | Control |
|---|---|
| Cost / abuse | Nothing server-side costs money. MCP has a 60/min per-IP limit (`src/lib/guard.ts`) |
| JD privacy | Processed only in the worker. An e2e test fails if any request body or URL contains the JD. No analytics events carry JD content |
| Model supply chain | Pinned model id and revision; WebLLM loads only from its configured host |
| Prompt injection | JD tagged as data; constrained decoding; verdicts computed in code; 100% injection gate |
| XSS | JD and extracted text rendered as React text only, never as HTML; Markdown export is plain text |
| Input | JD ≤ 12k chars; reject mostly-URL or binary input before the model runs |

A short "How this works and what stays on your device" panel goes on `/fit` and in the Process section.

## Observability

- **MCP:** one structured log line per request (already built). Ship to Axiom through a Vercel log drain when convenient.
- **`/fit`:** no telemetry, by design. The only numbers are the device benchmarks and CI evals.

## Private mode: optional, and never on devices that can't run it

The scan is always available and instant. The local model is something a visitor opts into. It is never auto-loaded, never prefetched, and never on the homepage.

**Load boundary.** The runtime sits behind a dynamic `import()` inside the Private-mode handler on `/fit`. Until that button is pressed, the page ships zero bytes of it. The homepage JS gate and a `/fit` first-load check keep it that way.

**Gating follows `morph-canvas.tsx`: no guessing from hardware hints; hard requirements first, then measure.** `navigator.deviceMemory` is missing on iOS Safari and `hardwareConcurrency` counts CPU cores, not GPU throughput, so neither is used.

| Step | When | Rule | If it fails |
|---|---|---|---|
| 1. Hard requirements | On `/fit`, at idle after `load` | WebGPU is available **in a worker**; `requestAdapter()` returns an adapter whose limits (`maxBufferSize`, `maxStorageBufferBindingSize`) fit the model | No button. The scan only, with no nagging |
| 2. Stated preferences | Same | `useSaveData()` is false | Button disabled: "Private mode is off because Data Saver is on." |
| 3. Storage | When the button is pressed | `navigator.storage.estimate()` has room for the model plus a margin | "Not enough storage for the ~1 GB model." |
| 4. Consent | When the button is pressed | Dialog: download size, from Hugging Face, cached for next time, the JD stays on this device | Cancel keeps the scan |
| 5. Microbenchmark | Before the download | About 200 ms of WebGPU matmuls sized like the model's layers → an estimated time to first row | Estimate > 10 s: "This device would take about N s." The download isn't started by default; the visitor can override |
| 6. Runtime watchdog | During inference | Time to first row > 15 s | Abort and keep the scan result; latch "too slow" in `sessionStorage` |

**Threading.**

| Work | Where it runs |
|---|---|
| Step 1 probe | `requestIdleCallback` after `load` (with `setTimeout` as the fallback), in a throwaway worker. The button's box is reserved while it's "Checking…" |
| Benchmark, download, cache writes, tokenizer, inference, JSON parsing, watchdog | One dedicated Web Worker, created on press. Only `create*PipelineAsync` is used |
| Judging (`src/lib/fit`) | In the worker too, so the main thread receives finished `Requirement` rows |
| Worker → UI | One `postMessage` per finished row |

If WebGPU isn't available in workers on a browser, that browser fails step 1. **Inference never falls back to the main thread.** A worker frees the main thread but not the GPU, so a Playwright test asserts no main-thread long task > 50 ms and INP ≤ 200 ms during a local run.

## Milestones

**Weekend 1 (done):** corpus, CI gates, MCP, `/llms.txt`, "Use with your AI" block.
- ☐ Still open: Vercel env vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `IP_HASH_SALT`); live Claude connector smoke test.

**Weekend 2: fit checker (about 13 h)**
- ☐ `src/lib/fit`: contract, prompt, judging, coverage, scan + gap vocabulary, Markdown export; unit tests (3 h)
- ☐ `src/lib/fit/local`: worker, WebLLM adapter, gate steps 1–6, benchmark (4 h)
- ☐ `/fit` UI: scan-first, Private mode, streaming rows, a11y, fixture-mode e2e, no-JD-on-the-wire e2e (4 h)
- ☐ Label the first 15 cases; local eval runner; pick the model (2 h)
- ☐ Ship: "Check your role against my work" link in the hero

**Weekend 3: CI gates + Process section (about 7 h)**
- ☐ CI model-runtime spike (node-llama-cpp vs SwiftShader) (1 h)
- ☐ Grow to about 28 cases incl. 6 injection (2 h)
- ☐ `ai-evals` job: path filter, cache, sticky PR comment, nightly `latest.json` (2 h)
- ☐ `fit:bench` on the reference devices; Process rows + privacy panel (2 h)

**Project done when:** a recruiter can use `/fit` (on any device, at the level it supports) or their own agent, every claim links to a source, and CI has blocked at least one deliberate regression.

## Open questions

- ☐ **Model + code v2:** does routed, per-segment yes/no with abstention, or a 25 MB embedding model, beat code on a held-out set? (2f)
- ☐ **Holdout JDs:** 10–15 real postings, labelled independently.
- ☐ **CI runtime:** node-llama-cpp proxy or real-runtime SwiftShader? Decided by the Weekend 3 spike.
- ☐ **Reference devices** for `fit:bench`: which laptop and phone?
- ☐ **`send_message` later?** Only if it's worth a second Formspree form without reCAPTCHA plus a per-IP limit.

## Risks

| Risk | Mitigation |
|---|---|
| Fit checker oversells you | The model never judges; verdicts are code; gap rows are always shown; poor-match cases in evals |
| Small model extracts badly | Constrained decoding, a skill vocabulary in the prompt, recall/precision gates, model choice by eval |
| Most visitors can't run the model | The scan works everywhere; the MCP server serves recruiters' own agents |
| 1 GB download feels heavy | Opt-in only, pre-download benchmark, clear size and progress, cached after the first time |
| CI eval is a proxy for the browser runtime | Same weights and schema; device benchmarks measured separately; SwiftShader spike as an alternative |
| `mcp-handler` / MCP spec churn | Tools are plain functions; the transport is a thin layer |
| Corpus goes stale | The link check runs in CI; tests hold numbers to the source data |
