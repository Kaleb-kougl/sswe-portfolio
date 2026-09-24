import { z } from 'zod';

import { normalizeSkill } from '@/data/corpus';

import { PROJECTS } from './projects';
import { defineTool } from './types';

export const listProjects = defineTool({
  name: 'list_projects',
  title: 'List Kaleb Kougl’s projects and roles',
  description:
    'Lists the work Kaleb Kougl can back with evidence: his roles (kind "role": Indeed, IBM, J.B. Hunt) and his projects (kind "project": published npm packages, an agentic AI pipeline, an internal Indeed tool, a Roblox game, a peer-reviewed paper). Each item has an id, name, period, summary, public links, skill tags and the ids of its evidence records. "featured" marks the four the portfolio site leads with. ' +
    'Pass `skill` to keep only items with evidence for that skill; aliases work ("mfe", "a11y", "r3f", "Node.js"). ' +
    'Call get_project with an id for the claims themselves.',
  inputSchema: z.object({
    skill: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe('A skill or alias to filter by, e.g. "module federation", "mfe", "react", "wcag".'),
  }),
  handler: ({ skill }) => {
    if (skill === undefined) return { projects: PROJECTS };

    const canonical = normalizeSkill(skill) ?? null;
    return {
      skill: { input: skill, canonical },
      projects: canonical ? PROJECTS.filter((p) => p.skills.includes(canonical)) : [],
      ...(canonical
        ? {}
        : {
            note: `"${skill}" is not in the skill vocabulary, so no project is tagged with it. Treat that as no evidence, or try search_evidence with it as a free-text query.`,
          }),
    };
  },
});
