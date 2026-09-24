import { EDUCATION } from '@/data/resumeData';

/**
 * DEGREE ASKS — "Bachelor's in Computer Science or equivalent experience".
 *
 * A degree line names no skill, so until this existed it was judged
 * not_assessed. The answer is on the site already (`EDUCATION` in
 * resumeData.ts), so it can be judged like a years-only row: from a fixed
 * record, with the arithmetic in the note and no evidence chips.
 *
 * The row's text is read for what it asks (level, field, an "or equivalent"
 * clause) — the one place a requirement's text moves a row out of
 * not_assessed. The verdict itself comes from `EDUCATION`, so the most a
 * job description can do is get its own degree line assessed.
 *
 * The policy, Kaleb's call (2026-09-24): a B.S. in Biological Sciences plus
 * a Full-Stack Web Development certificate
 * - meets a bachelor's with no field named;
 * - meets "computer science or a related field" and "or equivalent
 *   experience";
 * - is partial against a bachelor's in computer science with no such
 *   clause, because the degree itself isn't in CS;
 * - does not meet a master's or doctorate (partial when the ask allows
 *   equivalent experience).
 */

export type DegreeLevel = 'associate' | 'bachelor' | 'master' | 'doctorate';

const RANK: Readonly<Record<DegreeLevel, number>> = { associate: 1, bachelor: 2, master: 3, doctorate: 4 };
const LEVEL_NAME: Readonly<Record<DegreeLevel, string>> = {
  associate: "an associate's degree",
  bachelor: "a bachelor's degree",
  master: "a master's degree",
  doctorate: 'a doctorate',
};

export interface DegreeAsk {
  /** The lowest level the line accepts ("BS/MS" is a bachelor's ask). */
  level: DegreeLevel;
  /** `cs`: computing named, nothing broader; `related`: "or related/technical field"; `any`: no field. */
  field: 'any' | 'cs' | 'related';
  /** "or equivalent (practical) experience", "in lieu of". */
  equivalent: boolean;
}

const NEGATED = /\b(?:no|not|without|with or without)\b[^.;]{0,30}\bdegree\b|\bdegree\b[^.;]{0,20}\b(?:not|isn['’]t)\s+(?:required|necessary|needed)\b|\bdegree optional\b/i;

const LEVELS: readonly [DegreeLevel, RegExp][] = [
  ['associate', /\bassociate['’]?s?\s+degree\b/i],
  ['bachelor', /\bbachelor['’]?s?\b|\bundergraduate degree\b|\bb\.\s?[as]\.|\b(?:bs|ba|bsc|b\.sc|beng)\b(?=\s*(?:\/|or\b|and\b|in\b|,|degree|\())/i],
  ['master', /\bmaster['’]?s?\b|\bm\.\s?s\.|\b(?:ms|msc|m\.sc|meng|mba)\b(?=\s*(?:\/|or\b|and\b|in\b|,|degree|\(|$))/i],
  ['doctorate', /\bph\.?\s?d\b|\bdoctorate\b|\bdoctoral degree\b/i],
];

const CS_FIELD = /\bcomputer science\b|\b(?:software|computer|electrical|computer systems) engineering\b|\bengineering\b|\bcs\b|\bmath(?:ematics)?\b|\bphysics\b|\binformation (?:systems|technology)\b|\bdata science\b|\bstatistics\b/i;
const RELATED_FIELD = /\brelated\b|\btechnical (?:field|discipline|degree)\b|\bstem\b|\bquantitative (?:field|discipline)\b|\bsimilar (?:field|discipline)\b/i;
const EQUIVALENT = /\bequivalent\b|\bin lieu of\b|\bor (?:relevant |related |comparable |practical |professional |industry |work )*experience\b/i;

const YEARS_IN = /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;
const hasDegree = (clause: string) => LEVELS.some(([, re]) => re.test(clause)) || /\bdegree\b(?!\s+of\b)/i.test(clause);

/**
 * A line whose alternatives include one with years and no degree: "8+ years
 * of programming experience OR 4+ years with a PhD". The degree is one way
 * in, not a requirement, so the row is judged on its years alone.
 */
export function degreeOptional(text: string): boolean {
  const clauses = text.split(/\s*(?:\bor\b|;)\s*/i);
  if (clauses.length < 2) return false;
  const withDegree = clauses.some((c) => hasDegree(c) && YEARS_IN.test(c));
  const withoutDegree = clauses.some((c) => !hasDegree(c) && YEARS_IN.test(c));
  return withDegree && withoutDegree;
}

export interface DegreePath {
  level: DegreeLevel;
  years: number;
}

const PATH_DEGREE =
  "(bachelor['’]?s?(?: degree)?|b\\.?\\s?[as]\\.?|bs|ba|bsc|master['’]?s?(?: degree)?|m\\.?\\s?s\\.?|ms|msc|ph\\.?\\s?d\\.?|doctorate)";
const PATH_RE = new RegExp(`\\b${PATH_DEGREE}\\s+(?:degree\\s+)?(?:and|with|plus|\\+)\\s+(\\d{1,2})\\s*\\+?\\s*(?:years?|yrs?)\\b`, 'gi');

function levelOfName(name: string): DegreeLevel {
  if (/^(?:ph|doc)/i.test(name)) return 'doctorate';
  if (/^m/i.test(name)) return 'master';
  return 'bachelor';
}

/**
 * Degree-and-years paths: "BS and 8+ years of relevant work experience, MS
 * and 7+ years …, or PhD and 4+ years …". Null unless the line pairs a
 * degree with years at least once; one path met is enough.
 */
export function parseDegreePaths(text: string): DegreePath[] | null {
  if (NEGATED.test(text)) return null;
  const paths: DegreePath[] = [];
  PATH_RE.lastIndex = 0;
  for (let m = PATH_RE.exec(text); m; m = PATH_RE.exec(text)) {
    paths.push({ level: levelOfName(m[1]), years: Number(m[2]) });
  }
  return paths.length ? paths : null;
}

const PATH_NAME: Readonly<Record<DegreeLevel, string>> = {
  associate: "associate's",
  bachelor: "bachelor's",
  master: "master's",
  doctorate: 'doctorate',
};

/**
 * The paths judged against `EDUCATION` and the career's years: strong when
 * one is met (the note names it), else gap, with the nearest path's years
 * arithmetic in the note when I hold its degree.
 */
export function judgeDegreePaths(
  paths: readonly DegreePath[],
  careerYears: number,
  yearsNote: (years: number) => string,
  holding: Held = HELD,
): DegreeJudgement {
  const heldRank = holding.level ? RANK[holding.level] : 0;
  const open = paths.filter((p) => heldRank >= RANK[p.level]).sort((a, b) => a.years - b.years);
  const met = open.find((p) => careerYears >= p.years);
  if (met) {
    return {
      verdict: 'strong',
      note: `Meets the ${PATH_NAME[met.level]} + ${met.years} years path: ${holding.degree}; ${yearsNote(met.years)}`,
    };
  }
  if (open.length) {
    // Years short on every path I hold the degree for: a gap, like any row
    // whose years aren't met.
    return { verdict: 'gap', note: `${holding.degree}; ${yearsNote(open[0].years)}` };
  }
  const lowest = [...paths].sort((a, b) => RANK[a.level] - RANK[b.level])[0];
  return { verdict: 'gap', note: `No ${PATH_NAME[lowest.level]} degree${holding.degree ? `; my highest is a ${holding.degree}` : ''}.` };
}

/** What a requirement line asks of a degree, or null when it asks none. */
export function parseDegreeAsk(text: string): DegreeAsk | null {
  if (NEGATED.test(text) || degreeOptional(text)) return null;
  const found = LEVELS.filter(([, re]) => re.test(text)).map(([level]) => level);
  if (found.length === 0) {
    // A bare "degree" only as schooling: not "a high degree of ownership".
    if (!/\bdiploma in\b|\bdegree\b(?!\s+of\b)/i.test(text)) return null;
    // "A degree in Computer Science", "a technical degree": a bachelor's.
    found.push('bachelor');
  }
  const level = found.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
  const related = RELATED_FIELD.test(text);
  const field = related ? 'related' : CS_FIELD.test(text) ? 'cs' : 'any';
  return { level, field, equivalent: EQUIVALENT.test(text) };
}

interface Held {
  level: DegreeLevel | null;
  /** How the degree reads in a note, e.g. "B.S. in Biological Sciences (University of Arkansas, 2017)". */
  degree: string;
  /** The degree's field is computing. */
  csDegree: boolean;
  /** A computing certificate, e.g. "Full-Stack Web Development Certificate (Northwestern University, 2019)". */
  certificate: string | null;
}

const COMPUTING = /\b(?:computer|software|web development|full[- ]stack|programming|coding|computing|data science)\b/i;
const year = (date: string) => /\b(19|20)\d{2}\b/.exec(date)?.[0] ?? '';
const where = (school: string, date: string) => `(${[school, year(date)].filter(Boolean).join(', ')})`;

/** Read once from `EDUCATION`, so the notes can't drift from the career section. */
function held(): Held {
  let best: { level: DegreeLevel; text: string; field: string } | null = null;
  let certificate: string | null = null;
  for (const e of EDUCATION) {
    const d = e.degree;
    if (/\bcertificate\b/i.test(d)) {
      if (COMPUTING.test(d) && !certificate) certificate = `${d.replace(/\s*Certificate\b/i, ' certificate')} ${where(e.school, e.graduationDate)}`;
      continue;
    }
    const level: DegreeLevel | null = /\b(?:doctor|ph\.?d)/i.test(d)
      ? 'doctorate'
      : /\bmaster/i.test(d)
        ? 'master'
        : /\bbachelor/i.test(d)
          ? 'bachelor'
          : /\bassociate/i.test(d)
            ? 'associate'
            : null;
    if (!level || (best && RANK[best.level] >= RANK[level])) continue;
    const field = /\bin\s+([^,]+)/i.exec(d)?.[1]?.trim() ?? '';
    const short = d
      .replace(/^Bachelor of Science\b/i, 'B.S.')
      .replace(/^Bachelor of Arts\b/i, 'B.A.')
      .replace(/^Master of Science\b/i, 'M.S.')
      .replace(/,.*$/, '');
    best = { level, text: `${short} ${where(e.school, e.graduationDate)}`, field };
  }
  return {
    level: best?.level ?? null,
    degree: best?.text ?? '',
    csDegree: !!best && COMPUTING.test(best.field),
    certificate,
  };
}

const HELD = held();

export interface DegreeJudgement {
  verdict: 'strong' | 'partial' | 'gap';
  note: string;
}

/** A degree ask judged against `EDUCATION`, with the reason in the note. */
export function judgeDegree(ask: DegreeAsk, holding: Held = HELD): DegreeJudgement {
  const what = [holding.degree, holding.certificate].filter(Boolean).join(' and a ');
  const mine = what ? `${what.charAt(0).toUpperCase()}${what.slice(1)}` : 'No degree';

  if (!holding.level || RANK[holding.level] < RANK[ask.level]) {
    // The certificate doesn't bear on a graduate ask; the highest degree does.
    const lacks = `No ${LEVEL_NAME[ask.level].replace(/^an? /, '')}${holding.degree ? `; my highest is a ${holding.degree}` : ''}.`;
    return ask.equivalent
      ? { verdict: 'partial', note: `${lacks} The ask allows equivalent experience, so at most partial.` }
      : { verdict: 'gap', note: lacks };
  }
  if (ask.field === 'any') return { verdict: 'strong', note: `${mine}.` };
  if (holding.csDegree) return { verdict: 'strong', note: `${mine}.` };
  if (ask.field === 'related' && holding.certificate) {
    return { verdict: 'strong', note: `${mine}. The ask allows a related field.` };
  }
  if (ask.equivalent) return { verdict: 'strong', note: `${mine}. The ask allows equivalent experience.` };
  return { verdict: 'partial', note: `${mine}. Not a computer science degree, so at most partial.` };
}
