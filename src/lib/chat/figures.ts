/**
 * NUMBER FAMILIES: what a figure in a question is a figure OF.
 *
 * "He led a team of 10, right?" states a team size. The reply may only quote
 * records that state a team size too ("led a team of 6 engineers"), not
 * every record that happens to share a keyword ("20+ components used by 5
 * teams", "~12 engineers mentored"). A family is a handful of patterns in
 * which `N` stands for the figure, so the noun has to be attached to the
 * number, not just nearby. The same table reads the question and the record.
 *
 * A question whose figure fits no family gets "No record states a number for
 * that." rather than a guess. Nothing here ever returns the visitor's number.
 */

const NUMBER_WORDS = 'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|dozen';

/** A figure: "10", "~12", "20+", "680M+", "20,000", "ten", "a dozen". */
const N = String.raw`(?:[~≈]\s*)?(?:\d[\d,.]*(?:\s*(?:k|m|million|thousand|billion))?\+?|(?:a\s+)?(?:${NUMBER_WORDS}))`;

const LEAD = String.raw`(?:led|lead|leads|leading|managed|manage|manages|managing|ran|run|runs|running|headed|head|oversaw|oversee|supervised|supervise)`;
const PEOPLE = String.raw`(?:engineers?|developers?|devs?|people|persons?|members?|reports|ICs?)`;

export type NumberFamily = 'team' | 'mentoring' | 'percent' | 'users' | 'years' | 'count' | 'multiple' | 'size' | 'tests' | 'time';

/** One small table: each family and the shapes a figure of it takes. */
export const NUMBER_FAMILIES: readonly { id: NumberFamily; means: string; patterns: readonly string[] }[] = [
  {
    id: 'team',
    means: 'the size of a team he led or managed',
    patterns: [
      String.raw`\b${LEAD}\s+(?:a\s+|the\s+|my\s+|his\s+)?team\s+of\s+${N}`,
      String.raw`\b${LEAD}\s+(?:a\s+)?${N}\s*(?:-|\s)?${PEOPLE}\b`,
      String.raw`\b${LEAD}\s+(?:a\s+)?${N}\s*(?:-|\s)(?:person|people|member)\s+team\b`,
      String.raw`\bteam\s+of\s+${N}\s+${PEOPLE}\b`,
      String.raw`${N}\s*(?:-|\s)(?:person|people|member)\s+team\b`,
      String.raw`${N}\s+(?:direct\s+)?reports\b`,
    ],
  },
  {
    id: 'mentoring',
    means: 'people mentored',
    patterns: [
      String.raw`\bmentor(?:ed|s|ing)?\s+(?:about\s+|around\s+|like\s+|over\s+|roughly\s+)?${N}`,
      String.raw`${N}\s+(?:${PEOPLE}|juniors?|mentees)\s+mentored\b`,
      String.raw`${N}\s+mentees\b`,
    ],
  },
  { id: 'percent', means: 'a percentage', patterns: [String.raw`${N}\s*(?:%|percent\b|per\s+cent\b)`] },
  {
    id: 'users',
    means: 'users or customers served',
    patterns: [String.raw`${N}\s+(?:monthly\s+|daily\s+|active\s+)?(?:users|customers|visitors|clients|job\s*seekers|MAUs?|DAUs?)\b`],
  },
  { id: 'years', means: 'years of experience', patterns: [String.raw`${N}\s*(?:years?|yrs?)\b`] },
  {
    id: 'count',
    means: 'how many components, teams or services',
    patterns: [
      String.raw`${N}\s+(?:reusable\s+|decoupled\s+|shared\s+|internal\s+|consuming\s+|other\s+)?(?:components|teams|services|microservices|apps|applications|products|packages|libraries|repos|sites|pages|features|generators|modifiers)\b`,
    ],
  },
  { id: 'multiple', means: 'a multiple ("29x faster")', patterns: [String.raw`${N}\s*(?:x|×|times)(?![a-z])`] },
  { id: 'size', means: 'a file or bundle size', patterns: [String.raw`${N}\s*(?:kb|mb|gb|bytes)\b`] },
  { id: 'tests', means: 'tests or assertions', patterns: [String.raw`${N}\s+(?:passing\s+|distinct\s+|unit\s+|e2e\s+)?(?:tests|assertions|spec\s+files|test\s+cases)\b`] },
  {
    id: 'time',
    means: 'a length of time saved or spent',
    patterns: [String.raw`${N}\s*(?:engineer[-\s])?(?:hours?|hrs?|minutes?|mins?|days?|weeks?|months?|seconds?|ms)\b`],
  },
];

const COMPILED = NUMBER_FAMILIES.map((f) => ({ id: f.id, res: f.patterns.map((p) => new RegExp(p, 'i')) }));

/** The families a text's figures belong to (a text may state several). */
export function numberFamilies(text: string): NumberFamily[] {
  return COMPILED.filter((f) => f.res.some((re) => re.test(text))).map((f) => f.id);
}

/** Whether a record states a figure of any of these families, in its claim or its metric. */
export function statesFigureOf(record: { claim: string; metric?: string | null }, families: readonly NumberFamily[]): boolean {
  if (families.length === 0) return false;
  const found = new Set([...numberFamilies(record.claim), ...numberFamilies(record.metric ?? '')]);
  return families.some((f) => found.has(f));
}

/** A message that carries a figure (digits or a number word). */
export function hasFigure(message: string): boolean {
  return /\d/.test(message) || new RegExp(String.raw`\b(?:${NUMBER_WORDS})\b`, 'i').test(message);
}

/** Said when a question's figure fits no family, or no record states one of its kind. */
export const NO_FIGURE_LINE = 'No record states a number for that.';
