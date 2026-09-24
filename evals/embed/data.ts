import { fixtureSet, HOLDOUT_DIR, loadCaseDir, type Fixture } from '../holdout';

/**
 * The labelled JD sets the eval scores on (loading and label matching are
 * shared with the local-model eval in evals/holdout.ts):
 * - `fixtures`: the 8 fixtures (development data: the rules and their labels
 *   were written together);
 * - `holdout`: HOLDOUT_DIR (FIT_HOLDOUT_DIR, default evals/cases/holdout).
 *   Third-party postings, gitignored: detailed results on them go to
 *   evals/embed/results/holdout/ (also gitignored). A JD without a labels
 *   file is counted but not scored.
 */

export { fixtureSet, HOLDOUT_DIR };

export function holdoutSet(): { labelled: Fixture[]; unlabelled: string[] } {
  return loadCaseDir();
}
