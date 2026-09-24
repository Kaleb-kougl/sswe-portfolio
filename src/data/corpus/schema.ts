import { z } from 'zod';

/**
 * CORPUS SCHEMA — the shape agents and the fit checker read.
 *
 * The corpus is derived from `resumeData.ts` and `workProjects.ts`, not a
 * replacement for them: the site's sections keep rendering from those files,
 * and every record here points back at the entry it paraphrases. See
 * `index.ts` for where this is enforced at module load.
 */

/** Canonical skill tags are kebab-case, so they read the same in a URL, a
 * prompt and a test failure. */
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const Skill = z.object({
  id: z.string().regex(KEBAB),
  /** How the tag reads to a person. */
  label: z.string().min(1),
  /**
   * Other ways a job description spells the same thing. Matched through
   * `normalizeSkill`, so case, spaces and punctuation don't need listing.
   */
  aliases: z.array(z.string().min(1)),
});
export type Skill = z.infer<typeof Skill>;

export const Evidence = z.object({
  /**
   * `<entry>.<slug>`. The prefix is the entry's key, so a record traces back
   * to today's data by eye; the corpus test holds the prefix equal to `entry`.
   *
   * The regex is the plan's, unwidened. One existing key does not fit it —
   * `combat_system` has an underscore — but nothing cites that entry: its one
   * bullet not duplicated from r3f-projectiles (the IK enemies and boss AI)
   * has no public artifact to point at, so it fails the sourcing rule anyway.
   * If it ever gets one, widen the prefix to `[a-z0-9_-]+` here rather than
   * renaming the key the site already uses.
   */
  id: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/),
  /** The `RESUME_DATA` fileId or `WorkProjectId` this record paraphrases. */
  entry: z.string().min(1),
  /** One factual first-person sentence. Paraphrase only — never new copy. */
  claim: z.string().min(1),
  /** Canonical tags from `skills.ts` only. */
  skills: z.array(z.string().regex(KEBAB)).min(1),
  /**
   * The checkable number, stated briefly. Every figure in it must appear in
   * the source entry's text; the corpus test extracts the digits and checks.
   */
  metric: z.string().optional(),
  source: z.object({
    label: z.string().min(1),
    href: z.url({ protocol: /^https$/ }),
  }),
  period: z.string().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const Profile = z.object({
  name: z.string(),
  title: z.string(),
  summary: z.string(),
  location: z.string(),
  email: z.email(),
  links: z.object({
    site: z.url(),
    contactForm: z.url(),
    linkedin: z.url(),
    github: z.url(),
  }),
  /** Titles Kaleb has stated he is targeting. Empty means "not stated". */
  roleTargets: z.array(z.string()),
  /** A dated statement, or `null` when none has been made. */
  availability: z.string().nullable(),
});
export type Profile = z.infer<typeof Profile>;

export const Corpus = z.object({
  profile: Profile,
  skills: z.array(Skill),
  evidence: z.array(Evidence),
});
export type Corpus = z.infer<typeof Corpus>;
