import { describe, expect, it } from 'vitest';

import { CORPUS } from '@/data/corpus';
import { CONTACT_INFO } from '@/data/resumeData';
import { MCP_URL, SITE_URL } from '@/data/site';
import { renderLlmsFullTxt, renderLlmsTxt } from '@/lib/llms/render';
import { LLMS_SOURCE } from '@/lib/llms/source';

/**
 * `/llms.txt` and `/llms-full.txt`, rendered from the real data. The route
 * handlers are one-line wrappers around these functions, so this is the test
 * of what agents read.
 */

const llms = renderLlmsTxt(LLMS_SOURCE);
const full = renderLlmsFullTxt(LLMS_SOURCE);

/** H2 headings, in order. */
const h2s = (text: string) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

// Any formatting: 479-283-4454, (479) 283 4454, 479.283.4454, 4792834454.
// Same construction as the corpus test's.
const PHONE = new RegExp((CONTACT_INFO.phone.match(/\d+/g) ?? []).join('\\D{0,3}'));

describe('/llms.txt', () => {
  it('follows the llmstxt.org shape: H1, blockquote, then link sections', () => {
    const lines = llms.split('\n');
    expect(lines[0]).toBe(`# ${CORPUS.profile.name}`);
    expect(lines[1]).toBe('');
    expect(lines[2]).toMatch(/^> \S/);
    // Exactly one H1, and nothing but prose between the blockquote and the
    // first H2 (the spec allows no headings there).
    expect(llms.match(/^# /gm)).toHaveLength(1);
    expect(llms.slice(0, llms.indexOf('\n## '))).not.toMatch(/^#{2,} /m);
    expect(h2s(llms)).toEqual(['Projects', 'Experience', 'Contact', 'Optional']);
  });

  it('lists only `- [title](url)` links, with an optional note, under each section', () => {
    const sections = llms.split(/^## .+$/m).slice(1);
    for (const section of sections) {
      const items = section.trim().split('\n');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item).toMatch(/^- \[[^\]]+\]\((https:\/\/|mailto:)[^)\s]+\)(: .+)?$/);
      }
    }
  });

  it('points at the MCP server and at /llms-full.txt', () => {
    expect(llms).toContain(MCP_URL);
    expect(llms).toMatch(
      new RegExp(`^## Optional\\n- \\[[^\\]]+\\]\\(${SITE_URL}/llms-full\\.txt\\)`, 'm'),
    );
  });

  it('lists every role on the résumé and every Work card', () => {
    for (const entry of LLMS_SOURCE.experience) expect(llms).toContain(entry.dates);
    for (const card of LLMS_SOURCE.cards) expect(llms).toContain(`[${card.name}]`);
  });
});

describe('/llms-full.txt', () => {
  it('opens like llms.txt, then carries profile, evidence and skills', () => {
    expect(full.split('\n')[0]).toBe(`# ${CORPUS.profile.name}`);
    expect(full.split('\n')[2]).toMatch(/^> \S/);
    expect(h2s(full)).toEqual(['Profile', 'Evidence', 'Skills']);
    expect(full).toContain(MCP_URL);
  });

  it('carries every evidence record: id, claim, metric, skills and full source href', () => {
    for (const record of CORPUS.evidence) {
      expect(full).toContain(`#### ${record.id}\n`);
      expect(full).toContain(record.claim);
      if (record.metric) expect(full).toContain(`- Metric: ${record.metric}`);
      expect(full).toContain(`- Skills: ${record.skills.join(', ')}`);
      // The whole href, inside a link, not a truncated or rewritten one.
      expect(full).toContain(`](${record.source.href})`);
    }
  });

  it('groups records under their entry, one heading per entry', () => {
    const entries = [...new Set(CORPUS.evidence.map((e) => e.entry))];
    expect(full.match(/^### /gm)).toHaveLength(entries.length);
    for (const record of CORPUS.evidence) {
      const group = full.lastIndexOf('\n### ', full.indexOf(`#### ${record.id}\n`));
      const heading = full.slice(group, full.indexOf('\n#### ', group));
      expect(heading).toContain(`Entry: ${record.entry}`);
    }
  });

  it('lists every canonical skill', () => {
    for (const skill of CORPUS.skills) expect(full).toContain(`- ${skill.id}: ${skill.label}`);
  });
});

describe('both files', () => {
  it.each([
    ['llms.txt', llms],
    ['llms-full.txt', full],
  ])('%s never carries the phone number', (_name, text) => {
    expect(CONTACT_INFO.phone.replace(/\D/g, '')).toHaveLength(10);
    expect(text).not.toMatch(PHONE);
  });

  it('render deterministically', () => {
    expect(renderLlmsTxt(LLMS_SOURCE)).toBe(llms);
    expect(renderLlmsFullTxt(LLMS_SOURCE)).toBe(full);
    // A structurally equal copy renders the same bytes: no identity, clock or
    // randomness leaks in.
    const copy = structuredClone(LLMS_SOURCE);
    expect(renderLlmsTxt(copy)).toBe(llms);
    expect(renderLlmsFullTxt(copy)).toBe(full);
  });

  it('end with exactly one newline and contain no relative links', () => {
    for (const text of [llms, full]) {
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
      expect(text).not.toMatch(/\]\(\//);
    }
  });
});
