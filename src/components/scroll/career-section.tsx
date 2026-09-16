import { EDUCATION, RESUME_DATA, SUMMARY } from '@/data/resumeData';

/**
 * CareerSection — the "EXPERIENCE" block of the scrolling page.
 *
 * Every visible string here is DERIVED from `src/data/resumeData.ts`. Nothing
 * about a job is retyped: the résumé is the single source of truth, so the
 * page can never drift from it. If a role changes, change resumeData.
 *
 * Server component on purpose — no state, no effects, so the whole section
 * ships in the server HTML (which the no-JS/crawler e2e spec depends on).
 */

/* ------------------------------------------------------------------ *
 * Derivation helpers
 * ------------------------------------------------------------------ */

/**
 * Roles, newest first. `Object.values` preserves the authoring order of
 * RESUME_DATA (string keys keep insertion order per spec), which is already
 * reverse-chronological — so a new job added to resumeData shows up here
 * automatically, without an allow-list to forget to update.
 */
const ROLES = Object.values(RESUME_DATA).filter((entry) => entry.type === 'work');

/** Every 4-digit year inside a `dates` string, e.g. "Jun 2018 – Dec 2018". */
function yearsIn(dates: string): number[] {
  return (dates.match(/\d{4}/g) ?? []).map(Number);
}

/** The first year of the whole career — drives the eyebrow's range. */
const CAREER_START_YEAR = Math.min(...ROLES.flatMap((role) => yearsIn(role.dates)));

/** A role is current when resumeData says the end is open-ended. */
function isCurrentRole(dates: string): boolean {
  return /\b(present|now|current)\b/i.test(dates);
}

/**
 * Display form of a date range: "Aug 2022 – Present" → "AUG 2022 – NOW".
 * resumeData is the source of truth for the dates themselves; this only
 * changes their casing and the word for "still going".
 */
function formatDates(dates: string): string {
  return dates.replace(/\bpresent\b/i, 'Now').toUpperCase();
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

/** Spell a small number; fall back to digits past the table. */
function toWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Years of experience, read out of SUMMARY ("...7+ years building...") so the
 * heading and the résumé summary can never disagree. If SUMMARY ever stops
 * stating a number, fall back to the elapsed time since the first role.
 */
function yearsOfExperience(): number {
  const stated = SUMMARY.match(/(\d+)\+?\s*years/i);
  if (stated) return Number(stated[1]);
  return new Date().getFullYear() - CAREER_START_YEAR;
}

/** "Seven years, four steps up." — both numbers derived, neither hardcoded. */
const HEADING = `${capitalize(toWord(yearsOfExperience()))} years, ${toWord(
  ROLES.length
)} steps up.`;

/**
 * Education, oldest first, folded into one line. Degrees are authored as
 * "<Degree>, <Honors>" in resumeData, so the honors clause is moved into the
 * parenthetical beside the year: "Bachelor of Science, University of Arkansas
 * (Cum Laude, 2017)".
 */
const EDUCATION_LINE = [...EDUCATION]
  .sort((a, b) => Math.min(...yearsIn(a.graduationDate)) - Math.min(...yearsIn(b.graduationDate)))
  .map((school) => {
    const [degree, ...honors] = school.degree.split(', ');
    const parenthetical = [...honors, ...yearsIn(school.graduationDate).map(String)].join(', ');
    return `${degree}, ${school.school} (${parenthetical})`;
  })
  .join(' · ');

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function CareerSection() {
  return (
    <section id="career" className="w-full py-20 md:py-28">
      <div className="mx-auto w-full max-w-5xl px-6 md:px-10">
        <p className="eyebrow">{`EXPERIENCE · ${CAREER_START_YEAR} – NOW`}</p>

        <h2 className="mt-5 max-w-[16ch] font-display text-[32px] leading-[1.05] md:text-[56px]">
          {HEADING}
        </h2>

        <ol className="mt-12 md:mt-16">
          {ROLES.map((role) => {
            const current = isCurrentRole(role.dates);

            return (
              <li
                key={role.fileId}
                className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-hairline py-7 md:grid-cols-[150px_1fr] md:py-9"
              >
                {/* Left rail: dates, plus a CURRENT pill on the live role. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-col md:items-start md:gap-y-3">
                  <span className="font-mono text-xs leading-5 tracking-[0.06em] text-muted">
                    {formatDates(role.dates)}
                  </span>
                  {current && (
                    <span className="inline-flex items-center rounded-pill bg-lime px-2 py-0.5 font-mono text-[10px] font-bold uppercase leading-4 tracking-[0.12em] text-lime-ink">
                      Current
                    </span>
                  )}
                </div>

                {/* Right: company, title, and the impact sentence. */}
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-display text-2xl leading-tight text-ink">{role.company}</h3>
                    <p className="text-[15px] font-medium text-body">{role.title}</p>
                  </div>

                  <p className="mt-2.5 max-w-[64ch] text-[15px] leading-relaxed text-body-soft">
                    {role.summary}
                  </p>

                  {/* The one metric resumeData vouches for, verbatim. */}
                  {role.result && (
                    <p className="mt-2 font-mono text-xs leading-5 text-muted">{role.result}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <p className="border-t border-hairline pt-7 text-[15px] leading-relaxed text-muted">
          {EDUCATION_LINE}
        </p>
      </div>
    </section>
  );
}
