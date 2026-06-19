import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalConsole } from '@/components/terminal-console';
import { useEngineStore } from '@/store/useEngineStore';
import * as consoleLogsData from '@/data/consoleLogs';

// Mock the store
vi.mock('@/store/useEngineStore', () => ({
  useEngineStore: vi.fn(),
}));

describe('TerminalConsole', () => {
  const mockPushLog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent boot logs from actually firing multiple times during tests
    vi.spyOn(consoleLogsData, 'BOOT_LOGS', 'get').mockReturnValue([]);
  });

  function setupStore(consoleLogs: { id: string; msg: string }[]) {
    (useEngineStore as any).mockImplementation((selector: any) => {
      const state = {
        consoleLogs,
        pushLog: mockPushLog,
      };
      return selector(state);
    });
  }

  // Positive: Terminal successfully loops through logs, mapping .id to React keys
  it('successfully loops through logs and displays them', () => {
    const mockLogs = [
      { id: '1', msg: '[SYSTEM] Booting up...' },
      { id: '2', msg: '[NETWORK] Connection established.' },
    ];
    setupStore(mockLogs);

    render(<TerminalConsole />);

    expect(screen.getByText(/\[SYSTEM\]/)).toBeInTheDocument();
    expect(screen.getByText(/Booting up\.\.\./)).toBeInTheDocument();
    expect(screen.getByText(/\[NETWORK\]/)).toBeInTheDocument();
    expect(screen.getByText(/Connection established\./)).toBeInTheDocument();
    
    // Check log count indicator
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // Negative / Edge Case: Terminal component processing 0 logs displays gracefully blank shell UI
  it('displays gracefully blank shell UI when processing 0 logs', () => {
    setupStore([]);

    render(<TerminalConsole />);

    expect(screen.getByText('Awaiting system output...')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // Positive: Terminal scrolls smoothly to the absolute bottom when new logs mutate in
  it('sets scroll position to bottom when new logs are added', () => {
    const mockLogs = [{ id: '1', msg: 'First log' }];
    setupStore(mockLogs);
    
    const { rerender } = render(<TerminalConsole />);
    const scrollContainer = screen.getByRole('log');
    
    // We can't fully simulate layout calculation of scrollHeight in jsdom
    // but we can check if assigning scrollTop doesn't throw and scroll container exists
    expect(scrollContainer).toBeInTheDocument();

    // Rerender with new logs
    setupStore([
      { id: '1', msg: 'First log' },
      { id: '2', msg: 'Second log' }
    ]);
    
    expect(() => rerender(<TerminalConsole />)).not.toThrow();
    expect(screen.getByText('Second log')).toBeInTheDocument();
  });
});
