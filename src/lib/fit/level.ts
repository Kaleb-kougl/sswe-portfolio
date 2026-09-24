import { RESUME_DATA } from '@/data/resumeData';

/**
 * LEVEL — the posting's seniority next to Kaleb's most recent title.
 *
 * Read from the report's role (`findRole`, the JD's own title line) and the
 * newest `work` entry in RESUME_DATA, so it can't drift from the career
 * section. Informational only: it never changes a verdict or the coverage,
 * because a title is what a company calls a level, not evidence of work.
 * No line at all when the role names no level ("Software Engineer").
 */

export interface Level {
  /** 1 junior … 5 principal; null for a management title. */
  rank: number | null;
  name: string;
}

const LEVELS: readonly [RegExp, Level][] = [
  [/\b(?:engineering manager|manager,? engineering|director|head of engineering|vp of engineering|vice president)\b|\btechnical lead manager\b|\btlm\b/i, { rank: null, name: 'Management' }],
  [/\b(?:principal|distinguished|fellow)\b/i, { rank: 5, name: 'Principal' }],
  [/\bstaff\b/i, { rank: 4, name: 'Staff' }],
  [/\b(?:senior|sr\.?)\b|\b(?:engineer|developer)\s+iii\b/i, { rank: 3, name: 'Senior' }],
  [/\b(?:tech(?:nical)? lead|lead (?:engineer|developer|software engineer))\b/i, { rank: 3, name: 'Lead' }],
  [/\b(?:mid[- ]level|intermediate)\b|\b(?:engineer|developer)\s+(?:ii|2)\b/i, { rank: 2, name: 'Mid-level' }],
  [/\b(?:junior|jr\.?|entry[- ]level|new grad(?:uate)?|associate (?:software )?engineer|intern(?:ship)?)\b|\b(?:engineer|developer)\s+(?:i|1)\b/i, { rank: 1, name: 'Junior' }],
];

/** The level a job title states, or null when it states none. */
export function levelOf(title: string): Level | null {
  for (const [re, level] of LEVELS) if (re.test(title)) return level;
  return null;
}

/** The newest work entry: RESUME_DATA lists roles newest first. */
const LATEST = Object.values(RESUME_DATA).find((e) => e.type === 'work');
const MINE = LATEST ? { title: LATEST.title, company: LATEST.company.replace(/\.com$/, ''), level: levelOf(LATEST.title) } : null;

/**
 * "Level: Staff, one level above my most recent title (Senior Software
 * Engineer, Indeed)." Null when the role states no level, or the résumé's
 * latest title doesn't either.
 */
export function levelLine(role: string): string | null {
  const posting = levelOf(role);
  if (!posting || !MINE?.level) return null;
  const mine = `${MINE.title}, ${MINE.company}`;
  if (posting.rank === null) {
    return `Level: a management role. My most recent title is an individual-contributor one (${mine}).`;
  }
  if (MINE.level.rank === null) return `Level: ${posting.name}. My most recent title: ${mine}.`;
  const diff = posting.rank - MINE.level.rank;
  if (diff === 0) return `Level: ${posting.name}, the same as my most recent title (${mine}).`;
  if (diff > 0) return `Level: ${posting.name}, ${diff === 1 ? 'one level' : `${diff} levels`} above my most recent title (${mine}).`;
  return `Level: ${posting.name}, below my most recent title (${mine}).`;
}
