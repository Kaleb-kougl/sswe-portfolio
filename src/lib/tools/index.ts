import type { z } from 'zod';

import { checkFit } from './check-fit';
import { getCorpus } from './get-corpus';
import { getProfile } from './get-profile';
import { getProject } from './get-project';
import { listProjects } from './list-projects';
import { searchEvidence } from './search-evidence';
import { ToolInputError, type Tool } from './types';

export { ToolInputError, type Tool } from './types';
export { PROJECTS, PROJECT_IDS, type Project } from './projects';

/**
 * Every read tool, in the order an agent should meet them. The MCP route
 * registers exactly this list; add a tool here and it is served.
 */
export const TOOLS: readonly Tool[] = [
  getProfile,
  listProjects,
  getProject,
  searchEvidence,
  checkFit,
  getCorpus,
] as readonly Tool[];

/** Parse `input` against the tool's schema, then run it. Throws ToolInputError on bad input. */
export function runTool(name: string, input: unknown = {}): unknown {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new ToolInputError(`Unknown tool "${name}". Tools: ${TOOLS.map((t) => t.name).join(', ')}.`);
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ToolInputError(`Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}`);
  }
  return tool.handler(parsed.data as z.infer<typeof tool.inputSchema>);
}
