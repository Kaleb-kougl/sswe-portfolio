import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AskPanel, PANEL_EXAMPLES } from '@/components/fit/ask-panel';
import { EXAMPLE_QUESTIONS } from '@/lib/chat/answer';

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
      expect(screen.getByTestId('no-evidence').textContent).toBe('No evidence of Go in Kaleb’s work.');
      expect(document.querySelectorAll('[data-evidence-card]').length).toBeGreaterThan(0);
      expect(screen.getByTestId('ask-status').textContent).toMatch(/^React: Yes — \d+ records\. No evidence of Go/);
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
});
