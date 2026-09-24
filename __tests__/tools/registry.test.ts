import { describe, expect, it } from 'vitest';

import { TOOLS, ToolInputError, runTool } from '@/lib/tools';

describe('tool registry', () => {
  it('serves exactly the six read tools', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'get_profile',
      'list_projects',
      'get_project',
      'search_evidence',
      'check_fit',
      'get_corpus',
    ]);
  });

  it('gives every tool a model-facing description that says when to call it', () => {
    for (const t of TOOLS) {
      expect(t.description.length, t.name).toBeGreaterThan(150);
      expect(t.title, t.name).not.toBe('');
    }
  });

  it('produces JSON-serializable output for every tool', () => {
    const inputs: Record<string, object> = {
      get_project: { id: 'roblox-css' },
      search_evidence: { query: 'react' },
      check_fit: { job_description: 'Requirements:\n- 5+ years of React and TypeScript' },
    };
    for (const t of TOOLS) {
      const out = runTool(t.name, inputs[t.name] ?? {});
      expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    }
  });

  it('rejects an unknown tool', () => {
    expect(() => runTool('send_message')).toThrow(ToolInputError);
  });
});
