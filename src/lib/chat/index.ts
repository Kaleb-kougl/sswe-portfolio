import type { ChatMessage } from '@/lib/fit/contract';
import { runTool } from '@/lib/tools';

import { buildContext, type ChatContext } from './context';
import { buildChatMessages } from './prompt';
import { CANNED_NONE, routeMessage, type ChatRoute } from './route';

/**
 * ON-DEVICE CHAT SPIKE (measurement only; no page imports this).
 *
 * code routes → the tool runs → its output is trimmed to TOOL_OUTPUT → a
 * small model narrates it → the faithfulness checker flags or drops what
 * TOOL_OUTPUT doesn't back. Everything but the narration is pure.
 */

export { buildContext, thirdPerson, type ChatContext, type ContextRow } from './context';
export { CHAT_SYSTEM_PROMPT, buildChatMessages } from './prompt';
export { CANNED_NONE, looksLikeJd, routeMessage, skillsInMessage, type ChatRoute, type ChatToolName } from './route';
export { FILTER_FALLBACK, checkAnswer, cleanAnswer, extractNumbers, filterAnswer, splitSentences, type AnswerCheck, type Flag, type FlagKind } from './faithfulness';

/** A long message check_fit found no requirement lines in. */
export const NO_REQUIREMENTS =
  "I couldn't find any requirement lines in that text. Paste the job description's requirements section, or ask about a specific skill.";

export type ChatPlan =
  | { route: Extract<ChatRoute, { tool: 'none' }>; canned: string }
  | { route: Exclude<ChatRoute, { tool: 'none' }>; ctx: ChatContext; messages: ChatMessage[] }
  /** The tool rejected the input (e.g. check_fit's JD validation); answered with its message, no model. */
  | { route: Exclude<ChatRoute, { tool: 'none' }>; canned: string; toolError: string };

export function planChat(message: string): ChatPlan {
  return planWithRoute(message, routeMessage(message));
}

/**
 * The same plan with the route chosen by the caller. The evals use it to
 * run the narrator on messages the router would have refused ("Is he
 * good?"), to see what the model does without that protection.
 */
export function planWithRoute(message: string, route: ChatRoute): ChatPlan {
  if (route.tool === 'none') return { route, canned: CANNED_NONE };
  let output: unknown;
  try {
    output = runTool(route.tool, route.input);
  } catch (err) {
    const toolError = err instanceof Error ? err.message : String(err);
    return { route, canned: CANNED_NONE, toolError };
  }
  const ctx = buildContext(route, output, message);
  if (ctx.tool === 'check_fit' && ctx.facts.rows.length === 0) {
    return { route, canned: NO_REQUIREMENTS, toolError: 'check_fit found no requirements' };
  }
  return { route, ctx, messages: buildChatMessages(ctx) };
}
