import { z } from 'zod';

import { PROJECT_IDS, PROJECTS, evidenceFor } from './projects';
import { ToolInputError, defineTool } from './types';

export const getProject = defineTool({
  name: 'get_project',
  title: 'Get one project or role with its evidence',
  description:
    'Returns one of Kaleb Kougl’s projects or roles in full: its summary, period, links and every evidence record behind it (claim, skills, metric, source link). ' +
    'Call it after list_projects or search_evidence when you need the specific claims to quote or cite. ' +
    `Valid ids: ${PROJECT_IDS.join(', ')}. An evidence id such as "indeed-sr-swe.onehost-lead" also works and returns its project.`,
  inputSchema: z.object({
    id: z.string().min(1).max(120).describe('A project id from list_projects, e.g. "r3f-projectiles" or "indeed-sr-swe".'),
  }),
  handler: ({ id }) => {
    // Forgiving about case, whitespace and an evidence id's ".slug" suffix;
    // strict about everything else.
    const key = id.trim().toLowerCase().split('.')[0];
    const project = PROJECTS.find((p) => p.id === key);
    if (!project) {
      throw new ToolInputError(
        `No project with id "${id}". Valid ids: ${PROJECT_IDS.join(', ')}. Call list_projects to see what each one is.`,
      );
    }
    return { ...project, evidence: evidenceFor(project.id) };
  },
});
