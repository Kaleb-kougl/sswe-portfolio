import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AskPanel, PANEL_EXAMPLES } from '@/components/fit/ask-panel';
import { OPEN_REPORT_EVENT, type OpenReportDetail } from '@/components/fit/open-report';
import { CARDS_SHOWN, EXAMPLE_QUESTIONS, answer } from '@/lib/chat/answer';

import { FIXTURES } from '../fit/fixtures';

async function askOnce(question: string) {
  render(<AskPanel />);
  const box = screen.getByLabelText('Your question');
  fireEvent.change(box, { target: { value: question } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(screen.getAllByTestId('ask-turn')).toHaveLength(1));
  return screen.getAllByTestId('ask-turn')[0];
}

describe('AskPanel', () => {
  // jsdom has no layout, so no scrollIntoView.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows the same example questions the help reply offers', () => {
    expect(PANEL_EXAMPLES).toEqual(EXAMPLE_QUESTIONS);
  });

  it('answers a typed question with cards, announces it, keeps focus in the box, and stores nothing', async () => {
    const setItem = Storage.prototype.setItem;
    const writes: string[] = [];
    Storage.prototype.setItem = function (k: string, v: string) {
      writes.push(`${k}=${v}`);
      return setItem.call(this, k, v);
    };
    try {
      render(<AskPanel />);
      const box = screen.getByLabelText('Your question');
      fireEvent.change(box, { target: { value: 'React and Go?' } });
      fireEvent.keyDown(box, { key: 'Enter' });

      await waitFor(() => expect(screen.getAllByTestId('ask-turn')).toHaveLength(1));
      expect(screen.getByTestId('no-evidence').textContent).toBe('No evidence of Go in my work.');
      expect(document.querySelectorAll('[data-evidence-card]').length).toBeGreaterThan(0);
      // Set on the next frame, after the region is cleared (so a repeat is re-announced).
      await waitFor(() => expect(screen.getByTestId('ask-status').textContent).toMatch(/^React: Yes — \d+ records\. No evidence of Go/));
      expect(document.activeElement).toBe(box);
      expect((box as HTMLTextAreaElement).value).toBe('');
      expect(writes).toEqual([]);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  it('Shift+Enter does not send; an empty send explains itself', async () => {
    render(<AskPanel />);
    const box = screen.getByLabelText('Your question');
    fireEvent.change(box, { target: { value: 'React' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(screen.queryAllByTestId('ask-turn')).toHaveLength(0);
    fireEvent.change(box, { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Type a question first/));
  });

  it('caps each skill at two cards; "Show N more" is a button with aria-expanded that reveals the rest', async () => {
    const turn = await askOnce('React and Go?');
    const react = turn.querySelector('[data-finding="found"]')!;
    const visible = () => [...react.querySelectorAll('[data-evidence-card]')].filter((el) => !el.closest('[hidden]'));
    expect(visible()).toHaveLength(CARDS_SHOWN);
    const total = react.querySelectorAll('[data-evidence-card]').length;
    const button = screen.getByRole('button', { name: `Show ${total - CARDS_SHOWN} more` });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(button.getAttribute('aria-controls')!)?.hidden).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toBe('▶Show fewer');
    expect(visible()).toHaveLength(total);
    fireEvent.click(button);
    expect(visible()).toHaveLength(CARDS_SHOWN);
  });

  it('each card has one meta line: the entry once, the dates, and a short source link named in full', async () => {
    const turn = await askOnce('Have you used React?');
    const cards = [...turn.querySelectorAll('[data-evidence-card]')];
    expect(cards.length).toBeGreaterThan(2);
    const reply = answer('Have you used React?');
    if (reply.kind !== 'evidence' || reply.findings[0].status !== 'found') throw new Error('expected found');
    const byId = new Map([...reply.findings[0].cards, ...reply.findings[0].more].map((c) => [c.id, c]));
    for (const el of cards) {
      const card = byId.get(el.getAttribute('data-evidence-card')!)!;
      expect(el.querySelectorAll('[data-card-meta]')).toHaveLength(1);
      // The entry ("Software Engineer II, Indeed.com") shows once, not again in the link.
      expect((el.textContent ?? '').split(card.where).length - 1).toBe(1);
      const link = el.querySelector('a[data-evidence-id]')!;
      expect(link.textContent).toBe(card.source.short);
      // Accessible name: the full source label, which contains the visible word, with no doubled prefix.
      const name = link.getAttribute('aria-label')!;
      expect(name.toLowerCase()).toContain(card.source.short.toLowerCase());
      expect(name).toContain(card.source.label.replace(/^Work: /, ''));
      expect(name).not.toMatch(/ :|Work card: Work:/);
      if (card.source.external) expect(name).toMatch(/\(opens in a new tab\)$/);
    }
  });

  it('names each turn "Question N"; a pasted JD is read as its role, not its full text', async () => {
    const jd = FIXTURES.find((f) => f.name === 'fullstack-senior')!.jd;
    const turn = await askOnce(jd);
    const article = turn.querySelector('article')!;
    expect(article.getAttribute('aria-label')).toBe('Question 1');
    const reply = answer(jd);
    if (reply.kind !== 'fit') throw new Error('expected fit');
    const bubble = article.querySelector('p')!;
    expect(bubble.querySelector('.sr-only')?.textContent).toBe(`You pasted a job description: ${reply.summary.role}`);
    expect(bubble.querySelector('[aria-hidden="true"]')?.textContent).toBe(jd.trim());
  });

  it('a pasted JD becomes a summary card whose button hands the JD to the checker, in the page', async () => {
    const jd = FIXTURES.find((f) => f.name === 'fullstack-senior')!.jd;
    const received: string[] = [];
    const listener = (e: Event) => received.push((e as CustomEvent<OpenReportDetail>).detail.jd);
    window.addEventListener(OPEN_REPORT_EVENT, listener);
    try {
      const turn = await askOnce(jd);
      const reply = answer(jd);
      if (reply.kind !== 'fit') throw new Error('expected fit');
      const summary = turn.querySelector('[data-testid="fit-summary"]')!;
      expect(summary.querySelector('h3')?.textContent).toBe(reply.report.role);
      for (const v of ['strong', 'partial', 'gap', 'not_assessed'] as const) {
        const count = reply.report.requirements.filter((r) => r.verdict === v).length;
        expect(summary.querySelector(`[data-count-verdict="${v}"]`)?.getAttribute('data-count')).toBe(String(count));
      }
      // No full report in the thread.
      expect(turn.querySelectorAll('li[data-verdict]')).toHaveLength(0);
      fireEvent.click(screen.getByRole('button', { name: 'Open the full report' }));
      expect(received).toEqual([jd.trim()]);
    } finally {
      window.removeEventListener(OPEN_REPORT_EVENT, listener);
    }
  });
});
