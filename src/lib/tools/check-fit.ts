import { z } from 'zod';

import { CORPUS } from '@/data/corpus';
import { SITE_URL } from '@/data/site';
import { JD_MAX_CHARS } from '@/lib/fit/contract';
import { analyzeWithoutModel } from '@/lib/fit/analyze';
import { NO_COVERAGE_LINE, coverageLine } from '@/lib/fit/markdown';
import { validateJd } from '@/lib/fit/prompt';
import { SCAN_DISCLAIMER } from '@/lib/fit/scan';

import { ToolInputError, defineTool } from './types';

const EVIDENCE_BY_ID = new Map(CORPUS.evidence.map((e) => [e.id, e]));

/**
 * The /fit checker as a tool. It runs the same code-only pipeline as the page
 * (`analyzeWithoutModel`): no model runs here, so the calling agent's model
 * gets verdicts computed deterministically from the corpus and writes the
 * prose around them. That split is the one the evals favoured — code for the
 * verdicts, a strong LLM for the conversation.
 *
 * Privacy differs from /fit, and the description says so: /fit never sends
 * the JD anywhere, while a tool call carries it to this server. It is
 * processed in memory and discarded; the MCP route logs the tool name only.
 */
export const checkFit = defineTool({
  name: 'check_fit',
  title: 'Check a job description against Kaleb’s work',
  description:
    'Compares a job description with Kaleb Kougl’s portfolio and returns one row per requirement: its priority (must / nice, from the posting’s own section headers), a verdict (strong, partial, gap, not_assessed), a short note, and the evidence behind it with source links. ' +
    'Verdicts are computed by deterministic code from a fixed evidence corpus, not by a model, so present them as given: do not upgrade a gap or partial, and keep gaps visible. ' +
    'Add your own reading of the posting if useful, but label it as yours. Cite the evidence source links when you make a claim, and call get_project or search_evidence for more detail. ' +
    'Limits: requirement text is the posting’s own lines; skills are matched from engineering terms only; a posting without section headers gets no coverage score. ' +
    `The job description (up to ${JD_MAX_CHARS.toLocaleString('en-US')} characters) is processed in memory on the server and is not stored or logged.`,
  inputSchema: z.object({
    job_description: z
      .string()
      .max(JD_MAX_CHARS)
      .describe('The full job description text, as pasted by the user. Include section headers such as "Requirements" and "Nice to have" if present.'),
  }),
  handler: ({ job_description }) => {
    const check = validateJd(job_description);
    if (!check.ok) throw new ToolInputError(`${check.message} Ask the user for the job description text itself.`);

    const report = analyzeWithoutModel(check.jd);
    return {
      role: report.role,
      coverage: report.coverage ? coverageLine(report.coverage) : NO_COVERAGE_LINE,
      method: SCAN_DISCLAIMER,
      requirements: report.requirements.map((row) => ({
        text: row.text,
        priority: row.priority,
        verdict: row.verdict,
        note: row.note,
        evidence: row.evidenceIds.flatMap((id) => {
          const e = EVIDENCE_BY_ID.get(id);
          return e ? [{ id, claim: e.claim, source: e.source.href, sourceLabel: e.source.label }] : [];
        }),
      })),
      page: `${SITE_URL}/fit`,
    };
  },
});
