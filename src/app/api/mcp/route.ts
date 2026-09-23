import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
  isLegacyRequest,
} from '@modelcontextprotocol/server';
import { createMcpHandler } from 'mcp-handler';

import { rateLimit } from '@/lib/guard';
import { TOOLS, ToolInputError } from '@/lib/tools';

/**
 * /api/mcp — a read-only MCP server over the evidence corpus.
 *
 * WHY `api/mcp/route.ts` AND NOT `api/mcp/[transport]/route.ts`: that layout
 * was for mcp-handler 1.x, whose `basePath` mapped `[transport]` to `/mcp`
 * and `/sse`, making the public URL `/api/mcp/mcp`. mcp-handler 2.x removed
 * basePath and SSE; it never looks at the path, and the handler serves every
 * request it receives. A plain route puts the server at `/api/mcp`, the URL
 * the plan's `claude mcp add` line and `/llms.txt` give out. (A `[transport]`
 * segment would not match `/api/mcp` at all.)
 *
 * Stateless: mcp-handler 2.x serves the 2026-07-28 protocol; 2025-era POSTs
 * (every client shipping today) go to a per-request stateless transport with
 * JSON responses (see `legacyJson`). No sessions, no Redis for transport, no
 * SSE stream held open (`maxSubscriptions: 0`). GET and DELETE — 2025
 * session operations — answer 405.
 *
 * Nothing here spends tokens: every tool reads the static corpus. The guard
 * is a per-IP rate limit only (src/lib/guard.ts).
 */

const SERVER_INFO = { name: 'kaleb-kougl-portfolio', version: '1.0.0' };
const SERVER_OPTIONS = {
  instructions:
    'Read-only evidence about Kaleb Kougl’s engineering work. Start with get_profile for who he is and how to reach him; use search_evidence or list_projects for specific skills; use get_corpus to compare his work against a job description. Cite evidence ids and their source links; where nothing matches, say there is no evidence rather than inferring it.',
};

/** Every tool in the registry, read-only, JSON text out, input mistakes as tool errors. */
function registerTools(server: McpServer): void {
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: tool.title,
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input: unknown) => {
        try {
          const result = tool.handler(input as never);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (error) {
          if (!(error instanceof ToolInputError)) throw error;
          return { isError: true, content: [{ type: 'text' as const, text: error.message }] };
        }
      },
    );
  }
}

/** 2026-07-28 traffic. Answers with a plain JSON body: no tool emits progress, so nothing upgrades to SSE. */
const modern = createMcpHandler(registerTools, {
  serverInfo: SERVER_INFO,
  ...SERVER_OPTIONS,
  maxSubscriptions: 0,
});

/**
 * 2025-era POSTs. mcp-handler's built-in fallback frames every reply as a
 * one-event SSE stream, so these are served here instead, on a fresh
 * stateless transport per request with `enableJsonResponse`: one JSON body,
 * no stream, no session. Same tools, same server info.
 */
async function legacyJson(req: Request, parsedBody: unknown): Promise<Response> {
  const server = new McpServer(SERVER_INFO, SERVER_OPTIONS);
  registerTools(server);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req, { parsedBody });
}

async function serve(req: Request): Promise<Response> {
  if (req.method === 'POST') {
    const parsedBody: unknown = await req.clone().json().catch(() => undefined);
    if (parsedBody !== undefined && (await isLegacyRequest(req.clone(), parsedBody))) {
      return legacyJson(req, parsedBody);
    }
  }
  // Modern requests, and GET/DELETE (2025 session operations), which it answers 405.
  return modern(req);
}

interface RequestInfo {
  method?: string;
  tool?: string;
  client?: string;
}

/**
 * Method, tool and client name, read from a copy of the body for logging.
 * The client name comes from `initialize` (2025-era clients, once per
 * connection) or from the `_meta` envelope every 2026-07-28 request carries.
 * A 2025-era `tools/call` carries no client name, and with no sessions there
 * is nothing to join it back to, so those log `client: null`.
 */
async function peek(req: Request): Promise<RequestInfo> {
  if (req.method !== 'POST') return {};
  try {
    const body: unknown = await req.clone().json();
    const message = (Array.isArray(body) ? body[0] : body) as {
      method?: unknown;
      params?: { name?: unknown; clientInfo?: { name?: unknown }; _meta?: Record<string, { name?: unknown } | undefined> };
    };
    const params = message?.params;
    const client = params?.clientInfo?.name ?? params?._meta?.['io.modelcontextprotocol/clientInfo']?.name;
    return {
      method: typeof message?.method === 'string' ? message.method : undefined,
      tool: message?.method === 'tools/call' && typeof params?.name === 'string' ? params.name.slice(0, 80) : undefined,
      client: typeof client === 'string' ? client.slice(0, 80) : undefined,
    };
  } catch {
    return {};
  }
}

async function handler(req: Request): Promise<Response> {
  const started = Date.now();
  const info = await peek(req);
  const limited = await rateLimit('mcp', req);
  const res = limited ?? (await serve(req));
  // One line per request, no request content: which agents call, what, and how it went.
  console.log(
    JSON.stringify({
      route: '/api/mcp',
      method: info.method ?? req.method,
      tool: info.tool ?? null,
      client: info.client ?? null,
      status: res.status,
      ms: Date.now() - started,
    }),
  );
  return res;
}

export { handler as GET, handler as POST, handler as DELETE };
