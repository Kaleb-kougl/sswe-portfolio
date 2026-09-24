import { MCP_URL } from '@/data/site';

import { CopyButton } from './copy-button';

/* ---------------------------------------------------------------------------
   UseWithYourAi

   How to point an AI assistant at the portfolio's MCP server, rendered in the
   Contact section under the secondary links.

   A SERVER COMPONENT ON PURPOSE. ContactSection is a Client Component, so
   anything written inside it ships in its JS chunk. page.tsx passes this in as
   ContactSection's `children` instead: a Server Component handed to a Client
   Component as a prop is rendered on the server and travels as HTML (and in
   the RSC payload), not as code, so the static markup costs the homepage JS
   budget nothing (scripts/check-homepage-js.mjs). The copy button is the one
   client island, in its own tiny file.

   Setup lines, per client, kept to what each one documents:
     - Claude: custom connectors take a remote MCP URL in Settings → Connectors.
     - Claude Code: `claude mcp add --transport http <name> <url>`.
     - Cursor: `mcp.json` (project `.cursor/mcp.json` or global
       `~/.cursor/mcp.json`), where a remote server is an entry under
       `mcpServers` with a `url`.
   --------------------------------------------------------------------------- */

const HEADING_ID = 'use-with-your-ai-heading';

const CURSOR_CONFIG = JSON.stringify({ mcpServers: { kaleb: { url: MCP_URL } } });

export function UseWithYourAi() {
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="card card--panel card--hairline card--padded mx-auto mt-10 w-full max-w-[640px] text-left"
    >
      <h3 id={HEADING_ID} className="font-display text-xl leading-tight text-ink">
        Use with your AI
      </h3>
      <p className="mt-2 font-ui text-sm text-body">
        Ask your assistant about my work directly. This MCP server answers with
        sourced evidence from this site. It is read-only and needs no sign-in.
      </p>

      <p className="label-mono mt-4">
        Server URL
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <code
          data-testid="mcp-url"
          className="code code--field min-w-0 flex-1"
        >
          {MCP_URL}
        </code>
        <CopyButton text={MCP_URL} label="server URL" />
      </div>

      <dl className="mt-5 space-y-3 font-ui text-sm text-body">
        <div>
          <dt className="font-semibold text-ink">Claude</dt>
          <dd className="mt-0.5">
            Settings &rarr; Connectors &rarr; Add custom connector, then paste the
            URL.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Claude Code</dt>
          <dd>
            <code className="code code--block mt-1.5">
              claude mcp add --transport http kaleb {MCP_URL}
            </code>
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Cursor</dt>
          <dd className="mt-0.5">
            Add this to <code className="code code--inline">.cursor/mcp.json</code>
            <code className="code code--block mt-1.5">{CURSOR_CONFIG}</code>
          </dd>
        </div>
      </dl>

      <p className="mt-5 font-ui text-sm text-body">
        No MCP support? The same facts are in{' '}
        <a href="/llms.txt">/llms.txt</a>.
      </p>
    </section>
  );
}
