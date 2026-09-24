import { GAP_VOCABULARY, SKILLS_TABLE } from '@/data/corpus/skills';

import type { CanonicalSkillId, SegmentedJd } from '../contract';
import { detectSkills } from '../scan';

import type { SkillEmbeddingsFile, VocabularyEntry } from './vocabulary';

/**
 * THE EMBEDDING SYNONYM MATCHER (plan 2f, item 6): canonical skills a JD
 * segment names in words the alias scan has no entry for ("REST APIs" →
 * api-design, "mentored" → mentoring, "screen readers" → wcag).
 *
 * Pure and runtime-agnostic: the caller passes the model as a function
 * (`SpanEmbedFn`, or `EmbedFn` for the isolated variant) — transformers.js
 * in Node for the eval, or in a Web Worker — so this file never imports a
 * model runtime. Precision first: a skill is added only when one of the
 * segment's phrases is close to it (`tau`), clearly closer to it than to any
 * other skill or background sense (`margin`), the whole segment is about it
 * too (`tauContext`), and the alias scan hadn't already found it.
 *
 *   1. `extractSpans`: 1–4 word n-grams that don't start or end on a
 *      stopword or cross punctuation, minus any phrase the alias scan
 *      recognises and any piece of a vocabulary term (`isTermFragment`).
 *   2. Embed: the segment goes through the model once and each phrase is the
 *      mean of its tokens (read in its sentence), cosine against the
 *      committed vocabulary vectors (`skill-embeddings.json`).
 *   3. `scorePhrase` / `matchSegment`: best vs second-best skill, then at
 *      most `maxPerSegment` additions per segment, strongest first.
 *
 * STATUS: evaluated, not shipped. On the held-out JDs no setting reached 95%
 * precision (evals/embed/results/), so nothing in /fit imports this.
 */

/** Vocabulary entries whose skill starts with this are background senses, never added. */
export const BACKGROUND_PREFIX = '__';

/** Texts → unit vectors, each text embedded on its own (mean-pooled). */
export type EmbedFn = (texts: string[]) => Promise<Float32Array[]>;

/**
 * Contextual form: run `words` (joined by spaces) through the model once
 * and return, per span, the normalised mean of the token vectors that span
 * covers — the phrase as read in its sentence. The last vector returned is
 * the whole text's (the context vector).
 */
export type SpanEmbedFn = (words: string[], spans: readonly (readonly [number, number])[]) => Promise<Float32Array[]>;

export interface EmbedParams {
  /** Minimum cosine similarity between a phrase and a skill's nearest vocabulary text. */
  tau: number;
  /** Minimum gap between the best skill's score and the next skill's. */
  margin: number;
  /**
   * Context check: minimum similarity between the WHOLE segment and the
   * skill. A phrase match alone is often just a shared word ("design" →
   * design-systems); the segment has to be about the skill too.
   */
  tauContext: number;
  /** Additions per segment, strongest first. */
  maxPerSegment: number;
}

/**
 * Chosen by `evals/embed/sweep.eval.ts` on the development data (hand-written
 * lines + the 8 fixtures), for phrases read in context (`SpanEmbedFn`): no
 * add on any negative line, no wrong add on the fixtures, best recall. On
 * the held-out JDs this setting (and every other on the grid) stayed far
 * below 95% precision, so nothing ships it: see evals/embed/results/.
 */
export const EMBED_PARAMS: EmbedParams = { tau: 0.5, margin: 0.02, tauContext: 0.5, maxPerSegment: 3 };

// ------------------------------------------------------------ 1. phrases

/**
 * Words a skill phrase never starts or ends on: English function words and
 * JD filler ("experience", "strong", "years", "ability"). They may sit
 * inside a phrase ("time to interactive", "leading a team"), except the
 * conjunctions, which join two things rather than name one.
 */
export const EDGE_STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a an the and or nor but of to for with in on at by from into onto over under about as via per ' +
    'is are was were be been being am do does did have has had can could will would should may might must ' +
    'you your you\'re you’ve you\'ve we we\'re our us they them their it its this that these those who whom which what ' +
    'i me my he she his her there here where when how why all any some each every other such both either ' +
    'not no yes also very really just more most less least well too than then so if while ' +
    'experience experienced years year strong excellent deep solid proven good great high highly ' +
    'familiarity familiar proficiency proficient knowledge understanding ability able skills skill ' +
    'working hands-on background plus bonus preferred required ideally including e.g. i.e. etc ' +
    'using use used new other ability comfortable demonstrated track record expertise expert ' +
    'someone candidate candidates role team teams'
  ).split(/\s+/),
);

/** Conjunctions end a phrase even in the middle. */
const BREAK_WORDS: ReadonlySet<string> = new Set(['and', 'or', 'nor', 'but', '&', 'plus', 'as', 'well']);

/** Punctuation that separates phrases; "." only at a sentence or clause end. */
const CLAUSE_BREAK = /[,;:()[\]{}!?•|"“”]|\.(?=\s|$)|\s[-–—]\s/;

const TOKEN = /[A-Za-z0-9][A-Za-z0-9+#./'’-]*[A-Za-z0-9+#]|[A-Za-z0-9]/g;

export const MAX_PHRASE_WORDS = 4;

const isNumeric = (w: string) => /^[0-9][0-9.+%kKmM–-]*$/.test(w);

/**
 * A deliberately small stemmer for verb forms only: "designing"/"design",
 * "testing"/"test", "building"/"build", "migrated"/"migrate". Plurals are
 * left alone on purpose: a plural noun ("APIs", "tests") is usually the
 * thing itself, where a bare verb form ("Designing", "Testing") is usually
 * the everyday sense of a word the vocabulary only uses inside a term.
 */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/['’]s$/, '');
  if (w.length <= 4) return w;
  const suffix = w.match(/(?:ing|ed)$/);
  if (suffix && w.length - suffix[0].length >= 3) {
    w = w.slice(0, -suffix[0].length);
    if (/([^aeiouls])\1$/.test(w)) w = w.slice(0, -1); // "mapping" → "map"
  }
  return w;
}

const wordsOf = (term: string) => term.toLowerCase().match(/[a-z0-9+#]+/g) ?? [];

const norm = (words: string[]) => words.map(stem);

/** Every multi-word vocabulary term (skills and gap terms: id, label, aliases), normalised and space-padded. */
const VOCAB_TERMS: readonly string[] = [
  ...SKILLS_TABLE.flatMap((s) => [s.id, s.label, ...s.aliases]),
  ...GAP_VOCABULARY.flatMap((t) => [t.label, ...t.aliases]),
]
  .map(wordsOf)
  .filter((w) => w.length > 1)
  .map((w) => ` ${norm(w).join(' ')} `);

/**
 * True when the phrase is a piece of a vocabulary term: its words, in
 * order, appear inside a term ("design" in "design systems", "testing" in
 * "unit testing", "agents" in "ai agents", "lead" in "tech lead"). The scan
 * matches whole terms only, on purpose: the piece alone usually means
 * something else in a JD ("graphic design", "testing the waters", "support
 * agents"). An embedding of the bare piece would just re-find that shared
 * word, so pieces are never candidates. Inflections and synonyms are
 * ("mentored", "APIs", "tests", "screen readers").
 */
export function isTermFragment(phrase: string): boolean {
  const words = wordsOf(phrase);
  if (!words.length) return false;
  const needle = ` ${norm(words).join(' ')} `;
  return VOCAB_TERMS.some((t) => t.length > needle.length && t.includes(needle));
}

/**
 * Candidate phrases in a segment, in order of first appearance, deduplicated
 * case-insensitively. Dropped: a phrase the alias scan recognises (the scan
 * already reported it, or knows it as a gap term like "Go"), and a piece of
 * a vocabulary term (`isTermFragment`). What's left are words the scan has
 * no entry for — what the embedding model is for.
 */
export function extractPhrases(text: string): string[] {
  return extractSpans(text).spans.map((s) => s.phrase);
}

/** A candidate phrase and where it sits in `words` (end exclusive). */
export interface PhraseSpan {
  phrase: string;
  start: number;
  end: number;
}

/**
 * `extractPhrases` with positions: the segment's words (punctuation
 * dropped) and each candidate phrase's word span, first occurrence only.
 * A contextual embedder (`SpanEmbedFn`) runs the whole word list through
 * the model once and pools each span, so a phrase is read in its sentence.
 */
export function extractSpans(text: string): { words: string[]; spans: PhraseSpan[] } {
  const all: string[] = [];
  const spans: PhraseSpan[] = [];
  const seen = new Set<string>();
  for (const clause of text.split(CLAUSE_BREAK)) {
    const words = clause.match(TOKEN) ?? [];
    const offset = all.length;
    all.push(...words);
    for (let start = 0; start < words.length; start++) {
      const first = words[start].toLowerCase();
      if (EDGE_STOPWORDS.has(first) || isNumeric(first)) continue;
      for (let len = 1; len <= MAX_PHRASE_WORDS && start + len <= words.length; len++) {
        const word = words[start + len - 1];
        const lower = word.toLowerCase();
        if (len > 1 && BREAK_WORDS.has(lower)) break;
        if (EDGE_STOPWORDS.has(lower) || isNumeric(lower)) continue;
        const phrase = words.slice(start, start + len).join(' ');
        const k = phrase.toLowerCase();
        if (seen.has(k) || phrase.length < 3) continue;
        seen.add(k);
        if (isTermFragment(phrase) || detectSkills(phrase).length > 0) continue;
        spans.push({ phrase, start: offset + start, end: offset + start + len });
      }
    }
  }
  return { words: all, spans };
}

// ------------------------------------------------------------ 2. vectors

export interface Vocabulary {
  entries: readonly VocabularyEntry[];
  /** Unit vectors, one per entry. */
  vectors: readonly Float32Array[];
  dims: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Normalises in place and returns the vector. */
export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** The committed int8 vectors back to unit float vectors. */
export function decodeVocabulary(file: SkillEmbeddingsFile): Vocabulary {
  const dims = file.model.dims;
  const bytes = new Int8Array(base64ToBytes(file.vectors).buffer);
  if (bytes.length !== file.entries.length * dims) throw new RangeError('skill-embeddings.json: vector count mismatch');
  const vectors = file.entries.map((_, r) => {
    const v = new Float32Array(dims);
    for (let i = 0; i < dims; i++) v[i] = bytes[r * dims + i] * file.scales[r];
    return normalize(v);
  });
  return { entries: file.entries, vectors, dims };
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ------------------------------------------------------------ 3. decisions

export interface PhraseScore {
  phrase: string;
  skill: string;
  score: number;
  /** The best score among all other skills. */
  runnerUp: number;
  runnerUpSkill: string;
  /** The vocabulary text that matched. */
  via: string;
}

/** The phrase's nearest skill (max over that skill's texts) and the next-nearest skill. */
export function scorePhrase(phrase: string, vector: Float32Array, vocab: Vocabulary): PhraseScore {
  const best = new Map<string, { score: number; via: string }>();
  vocab.vectors.forEach((v, i) => {
    const { skill, text } = vocab.entries[i];
    const score = dot(vector, v);
    const prev = best.get(skill);
    if (!prev || score > prev.score) best.set(skill, { score, via: text });
  });
  let top = { skill: '', score: -Infinity, via: '' };
  let second = { skill: '', score: -Infinity };
  for (const [skill, { score, via }] of best) {
    if (score > top.score) {
      second = { skill: top.skill, score: top.score };
      top = { skill, score, via };
    } else if (score > second.score) {
      second = { skill, score };
    }
  }
  return { phrase, skill: top.skill, score: top.score, runnerUp: second.score, runnerUpSkill: second.skill, via: top.via };
}

/** The margin rule: close enough, and clearly closer than any other skill. */
export function acceptsPhrase(s: PhraseScore, params: EmbedParams): boolean {
  return s.score >= params.tau && s.score - s.runnerUp >= params.margin;
}

export interface EmbedAddition {
  skill: CanonicalSkillId;
  score: number;
  phrase: string;
  via: string;
}

/**
 * A segment's additions from its scored phrases: accepted phrases whose
 * skill code hasn't already found, best score per skill, strongest first,
 * at most `maxPerSegment`.
 */
export function matchSegment(
  scores: readonly PhraseScore[],
  found: readonly string[],
  params: EmbedParams,
  context: Readonly<Record<string, number>> = {},
): EmbedAddition[] {
  const best = new Map<string, EmbedAddition>();
  for (const s of scores) {
    if (!acceptsPhrase(s, params) || found.includes(s.skill) || s.skill.startsWith(BACKGROUND_PREFIX)) continue;
    if ((context[s.skill] ?? 1) < params.tauContext) continue;
    const prev = best.get(s.skill);
    if (!prev || s.score > prev.score) best.set(s.skill, { skill: s.skill, score: s.score, phrase: s.phrase, via: s.via });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, params.maxPerSegment);
}

export interface ScoredSegment {
  index: number;
  phrases: PhraseScore[];
  /** The whole segment's similarity to each skill (max over the skill's texts). */
  context: Record<string, number>;
}

/** A vector's similarity to every skill: the max over that skill's vocabulary texts. */
export function skillSimilarities(vector: Float32Array, vocab: Vocabulary): Record<string, number> {
  const out: Record<string, number> = {};
  vocab.vectors.forEach((v, i) => {
    const skill = vocab.entries[i].skill;
    const score = dot(vector, v);
    if (!(skill in out) || score > out[skill]) out[skill] = score;
  });
  return out;
}

/**
 * Every candidate segment's phrases, scored: the expensive half (the model
 * calls). `additionsFor` then applies a threshold, so the eval can sweep
 * thresholds without re-embedding. In context (the default and the tuned
 * variant): one model call per segment.
 */
export async function scoreCandidates(seg: SegmentedJd, spanEmbed: SpanEmbedFn, vocab: Vocabulary): Promise<ScoredSegment[]> {
  const out: ScoredSegment[] = [];
  for (const index of seg.candidates) out.push({ index, ...(await scoreInContext(seg.segments[index].text, spanEmbed, vocab)) });
  return out;
}

/**
 * The isolated variant, for comparison and for CLS-pooled models: every
 * distinct phrase embedded on its own (no sentence around it), plus each
 * segment for the context check.
 */
export async function scoreCandidatesIsolated(seg: SegmentedJd, embed: EmbedFn, vocab: Vocabulary): Promise<ScoredSegment[]> {
  const perSegment = seg.candidates.map((index) => ({ index, phrases: extractPhrases(seg.segments[index].text) }));
  const withPhrases = perSegment.filter((s) => s.phrases.length > 0);
  const unique = [...new Set(withPhrases.flatMap((s) => s.phrases))];
  const texts = [...unique, ...withPhrases.map((s) => seg.segments[s.index].text)];
  const vectors = texts.length ? await embed(texts) : [];
  const byPhrase = new Map(unique.map((p, i) => [p, scorePhrase(p, vectors[i], vocab)]));
  const context = new Map(withPhrases.map((s, i) => [s.index, skillSimilarities(vectors[unique.length + i], vocab)]));
  return perSegment.map(({ index, phrases }) => ({
    index,
    phrases: phrases.map((p) => byPhrase.get(p)!),
    context: context.get(index) ?? {},
  }));
}

/** One text's phrases, read in context: one model call for the whole text. */
export async function scoreInContext(
  text: string,
  spanEmbed: SpanEmbedFn,
  vocab: Vocabulary,
): Promise<{ phrases: PhraseScore[]; context: Record<string, number> }> {
  const { words, spans } = extractSpans(text);
  if (!spans.length) return { phrases: [], context: {} };
  const vectors = await spanEmbed(words, [...spans.map((s) => [s.start, s.end] as const), [0, words.length] as const]);
  return {
    phrases: spans.map((s, i) => scorePhrase(s.phrase, vectors[i], vocab)),
    context: skillSimilarities(vectors[spans.length], vocab),
  };
}

/** Additions per segment index (only segments with at least one). */
export function additionsFor(
  seg: SegmentedJd,
  scored: readonly ScoredSegment[],
  params: EmbedParams = EMBED_PARAMS,
): Map<number, EmbedAddition[]> {
  const out = new Map<number, EmbedAddition[]>();
  for (const { index, phrases, context } of scored) {
    const adds = matchSegment(phrases, seg.segments[index].skills, params, context);
    if (adds.length) out.set(index, adds);
  }
  return out;
}
