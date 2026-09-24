/* ---------------------------------------------------------------------------
   "Open the full report": the chat's JD summary card hands the posting to the
   fit checker above it, in the page, with a DOM event. The checker fills its
   textarea with the JD, runs the same scan, and moves focus (and the scroll)
   to the report's heading.

   An event rather than shared state: the checker and the chat are separate
   client islands in a Server Component page, and neither should import the
   other's engine chunk. The JD travels in `detail` of an in-page event; like
   everything else here it never leaves the page.
   --------------------------------------------------------------------------- */

export const OPEN_REPORT_EVENT = 'fit:open-report';

export interface OpenReportDetail {
  jd: string;
}

export function openFullReport(jd: string): void {
  window.dispatchEvent(new CustomEvent<OpenReportDetail>(OPEN_REPORT_EVENT, { detail: { jd } }));
}
