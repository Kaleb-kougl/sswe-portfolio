import { renderLlmsFullTxt } from '@/lib/llms/render';
import { LLMS_SOURCE } from '@/lib/llms/source';

/**
 * `/llms-full.txt`: the whole evidence corpus as Markdown — profile, every
 * evidence record grouped by role or project, and the skill glossary. The
 * `## Optional` link in `/llms.txt` points here.
 *
 * Static and text/plain for the same reasons as `../llms.txt/route.ts`:
 * `force-static` because GET handlers are dynamic by default without Cache
 * Components, and text/plain because that is what the llms.txt convention
 * serves `.txt` Markdown as, and what a browser will show rather than download.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(renderLlmsFullTxt(LLMS_SOURCE), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
