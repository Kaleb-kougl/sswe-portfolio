import type { Evidence } from '@/data/corpus';
import type { LlmsEntry, LlmsSource } from './source';

/**
 * Renderers for `/llms.txt` and `/llms-full.txt`.
 *
 * Pure: a `LlmsSource` in, a string out, no clock, no randomness and no
 * environment, so the same corpus always renders byte-for-byte the same file.
 * That is what lets the route handlers be prerendered at build time, and it is
 * what `__tests__/llms.test.ts` holds them to.
 *
 * FORMAT (https://llmstxt.org): an H1 with the name, a blockquote summary,
 * free Markdown with no headings, then H2 sections of `- [title](url): note`
 * link lists. An `## Optional` section marks what a reader short on context
 * can skip. `/llms-full.txt` has no fixed spec; by convention it is the same
 * H1 and blockquote followed by the full content as Markdown.
 */

/** Square brackets would end a link's text early. Nothing else in Markdown
 * link text needs escaping for the content this renders. */
function linkText(text: string): string {
  return text.replace(/[[\]]/g, (c) => `\\${c}`);
}

function link(title: string, href: string, note?: string): string {
  return `- [${linkText(title)}](${href})${note ? `: ${note}` : ''}`;
}

/** "Senior Software Engineer, Indeed.com", or just the title when there is no
 * company to add. */
function entryName(entry: LlmsEntry): string {
  return entry.company ? `${entry.title}, ${entry.company}` : entry.title;
}

function joinBlocks(blocks: readonly string[]): string {
  return `${blocks.join('\n\n')}\n`;
}

function header(source: LlmsSource): string[] {
  const { profile } = source.corpus;
  const facts = [`${profile.title} based in ${profile.location}.`];
  if (profile.roleTargets.length > 0) {
    facts.push(`Targeting ${profile.roleTargets.join(' or ')} roles.`);
  }
  if (profile.availability) facts.push(`${profile.availability}.`);

  return [
    `# ${profile.name}`,
    `> ${profile.summary}`,
    facts.join(' '),
    `AI agents can query this portfolio directly: there is a read-only MCP server (Streamable HTTP, no sign-in) at ${source.mcpUrl}. Every claim it returns carries a source link.`,
  ];
}

/** Where an evidence-backed résumé project points: its first cited source. */
function firstSource(source: LlmsSource, entryId: string): string {
  const record = source.corpus.evidence.find((e) => e.entry === entryId);
  if (!record) throw new Error(`No evidence cites ${entryId}`);
  return record.source.href;
}

export function renderLlmsTxt(source: LlmsSource): string {
  const { profile } = source.corpus;
  const cardIds = new Set(source.cards.map((c) => c.id));

  const projects = [
    ...source.cards.map((card) =>
      link(
        card.name,
        card.href ?? source.anchors.work,
        card.href ? card.description : `${card.description} (${card.linkNote ?? 'No public link'}.)`,
      ),
    ),
    // Résumé projects the corpus cites that are not one of the four cards.
    ...Object.values(source.entries)
      .filter((e) => e.type === 'project' && !cardIds.has(e.id))
      .map((e) => link(e.title, firstSource(source, e.id), e.summary)),
  ];

  const experience = source.experience.map((e) =>
    link(entryName(e), source.anchors.career, `${e.dates}. ${e.summary}`),
  );

  const contact = [
    link('Email', `mailto:${profile.email}`, profile.email),
    link('Contact form', profile.links.contactForm, 'The form on the homepage.'),
    link('LinkedIn', profile.links.linkedin),
    link('GitHub', profile.links.github),
    link('Résumé (PDF)', source.resumeUrl),
    link('MCP server', source.mcpUrl, 'Streamable HTTP endpoint for AI agents; read-only.'),
  ];

  return joinBlocks([
    ...header(source),
    ['## Projects', ...projects].join('\n'),
    ['## Experience', ...experience].join('\n'),
    ['## Contact', ...contact].join('\n'),
    [
      '## Optional',
      link(
        'Full corpus',
        source.fullUrl,
        'every evidence record as Markdown, grouped by role or project, each with its claim, metric, skills and source link.',
      ),
    ].join('\n'),
  ]);
}

function renderRecord(record: Evidence): string {
  const lines = [`#### ${record.id}`, '', record.claim, ''];
  if (record.metric) lines.push(`- Metric: ${record.metric}`);
  if (record.period) lines.push(`- Period: ${record.period}`);
  lines.push(`- Skills: ${record.skills.join(', ')}`);
  lines.push(`- Source: [${linkText(record.source.label)}](${record.source.href})`);
  return lines.join('\n');
}

export function renderLlmsFullTxt(source: LlmsSource): string {
  const { profile, evidence, skills } = source.corpus;

  const profileLines = [
    '## Profile',
    '',
    `- Name: ${profile.name}`,
    `- Title: ${profile.title}`,
    `- Location: ${profile.location}`,
    `- Role targets: ${profile.roleTargets.length > 0 ? profile.roleTargets.join('; ') : 'not stated'}`,
    `- Availability: ${profile.availability ?? 'not stated'}`,
    `- Email: ${profile.email}`,
    `- Site: ${profile.links.site}`,
    `- Contact form: ${profile.links.contactForm}`,
    `- LinkedIn: ${profile.links.linkedin}`,
    `- GitHub: ${profile.links.github}`,
    `- MCP server: ${source.mcpUrl}`,
  ].join('\n');

  // Grouped by entry, in the order the corpus first cites each one.
  const groups = new Map<string, Evidence[]>();
  for (const record of evidence) {
    const group = groups.get(record.entry);
    if (group) group.push(record);
    else groups.set(record.entry, [record]);
  }

  const evidenceBlocks = [...groups].map(([entryId, records]) => {
    const entry = source.entries[entryId];
    const heading = entry ? entryName(entry) : entryId;
    const meta = [`Entry: ${entryId}`];
    if (entry?.dates) meta.push(`Dates: ${entry.dates}`);
    return [`### ${heading}`, meta.join(' · '), ...records.map(renderRecord)].join('\n\n');
  });

  const skillLines = skills.map((s) => {
    const aliases = s.aliases.length > 0 ? ` (also: ${s.aliases.join(', ')})` : '';
    return `- ${s.id}: ${s.label}${aliases}`;
  });

  return joinBlocks([
    ...header(source),
    profileLines,
    [
      '## Evidence',
      'One factual, first-person claim per record, each with a stable ID and a link to where it can be checked. Cite records by ID.',
    ].join('\n\n'),
    ...evidenceBlocks,
    ['## Skills', '', 'The canonical tags used in `Skills:` above, with the other spellings they cover.', '', ...skillLines].join('\n'),
  ]);
}
