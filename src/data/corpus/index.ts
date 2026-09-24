import { EVIDENCE } from './evidence';
import { PROFILE } from './profile';
import { Corpus } from './schema';
import { SKILLS_TABLE } from './skills';

export { normalizeSkill, skillKey } from './skills';
export type { Corpus, Evidence, Profile, Skill } from './schema';

/**
 * The validated corpus. Parsed at module load, so a malformed record throws
 * the first time anything imports this — in `next build`, in the unit tests
 * and in the corpus scripts — rather than reaching an agent. Referential
 * checks (known entries, canonical skills, honest metrics) are in
 * `__tests__/corpus.test.ts`.
 */
export const CORPUS: Corpus = Corpus.parse({
  profile: PROFILE,
  skills: SKILLS_TABLE,
  evidence: EVIDENCE,
});
