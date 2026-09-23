import type { z } from 'zod';

/**
 * A read tool: a name, a description written for a model, a Zod input schema
 * and a plain handler. Nothing in `src/lib/tools/` imports Next or MCP, so the
 * MCP route, the fit checker and the eval runner all call the same functions.
 */
export interface Tool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  /** Short, human-readable. MCP clients show it in their tool pickers. */
  title: string;
  /** For the calling model: what the tool is for and when to reach for it. */
  description: string;
  inputSchema: S;
  /** Receives input already parsed by `inputSchema`. Returns JSON-safe data. */
  handler: (input: z.infer<S>) => unknown;
}

/** Type-checks a tool's handler against its own schema. */
export function defineTool<S extends z.ZodObject>(tool: Tool<S>): Tool<S> {
  return tool;
}

/**
 * A mistake in the caller's input (unknown id, nothing to search for). The
 * message is meant to be read by the calling model, so it says how to recover.
 * Adapters report it as a tool error, not a server failure.
 */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}
