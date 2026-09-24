'use client';

import type { Ref } from 'react';

import type { FitReport } from '@/lib/fit/contract';

import { FitReportView } from './fit-report';
import { PrivateModePanel, type PrivateMode } from './private-mode';
import { MarkdownActions } from './report-actions';

/* ---------------------------------------------------------------------------
   The fit checker's ENGINE CHUNK, loaded with `import()` by fit-checker.tsx
   at idle after `load` (and awaited on submit, in case it hasn't arrived).

   Everything that needs the corpus lives behind this one boundary: the
   analysis itself, the report view (evidence labels and links) and the
   Markdown export. `CORPUS` and the fit contract are validated with zod at
   import, so together they are ~110 KB gzip — kept out of /fit's first-load
   JS so the page and its textarea arrive with the React runtime alone.
   --------------------------------------------------------------------------- */

export { analyzeWithoutModel } from '@/lib/fit/analyze';
export { validateJd } from '@/lib/fit/prompt';

export interface Scan {
  report: FitReport;
  jd: string;
  run: number;
}

export function FitResults({
  scan,
  shown,
  modelReport,
  privateMode,
  headingRef,
}: {
  scan: Scan;
  /** The report on screen: the model's once its rows arrive, else the scan. */
  shown: FitReport;
  modelReport: FitReport | null;
  privateMode: PrivateMode;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const running = privateMode.flow.step === 'running';
  return (
    <div id="fit-results" className="mt-12">
      <FitReportView
        key={scan.run}
        report={shown}
        headingId="fit-report-heading"
        headingRef={headingRef}
        pending={running}
        actions={
          <MarkdownActions
            report={running ? scan.report : shown}
            label={running ? 'Copy the keyword scan as Markdown' : undefined}
          />
        }
      />

      {modelReport ? (
        <details data-testid="scan-disclosure" className="mt-10 rounded-xl border border-hairline bg-panel p-5 sm:p-6">
          <summary className="min-h-[44px] cursor-pointer content-center font-ui text-sm font-semibold text-ink">
            Show keyword scan
          </summary>
          <div className="mt-4">
            <FitReportView report={scan.report} headingId="fit-scan-heading" level={3} />
          </div>
        </details>
      ) : null}

      <PrivateModePanel mode={privateMode} jd={scan.jd} expectedRows={scan.report.requirements.length} />
    </div>
  );
}
