import { renderLlmsTxt } from '@/lib/llms/render';
import { LLMS_SOURCE } from '@/lib/llms/source';

/**
 * `/llms.txt` (https://llmstxt.org): a Markdown index of the site for LLMs.
 *
 * A folder named `llms.txt` is a normal route segment; the Next 16 docs use
 * this exact name as an example of a custom Route Handler
 * (01-app/02-guides/backend-for-frontend.md).
 *
 * `force-static` is required, not decorative. Without Cache Components (not
 * enabled in next.config.ts), GET Route Handlers are dynamic by default since
 * v15 (01-app/03-api-reference/03-file-conventions/route.md, version history),
 * and the guide says to opt into caching with this segment option
 * (01-app/01-getting-started/15-route-handlers.md). The body depends only on
 * committed data, so it is rendered once at build time and served as a file.
 *
 * text/plain, not text/markdown: the file is Markdown but its extension is
 * .txt, llmstxt.org's own files are served as text/plain, and browsers display
 * text/plain inline where text/markdown often triggers a download.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(renderLlmsTxt(LLMS_SOURCE), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
