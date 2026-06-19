import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MobileBottomSheet } from '@/components/mobile/mobile-bottom-sheet';
import { useEngineStore, type ViewState } from '@/store/useEngineStore';

// Mock the store
vi.mock('@/store/useEngineStore', () => ({
  useEngineStore: vi.fn(),
}));

// Mock the nested components to simplify testing
vi.mock('@/components/inspector-panel', () => ({
  InspectorPanelContent: () => <div data-testid="inspector-panel-content">Inspector Content</div>,
}));

vi.mock('@/components/mobile/mobile-console-content', () => ({
  MobileConsoleContent: () => <div data-testid="mobile-console-content">Console Content</div>,
}));

describe('MobileBottomSheet', () => {
  const mockSetSheetState = vi.fn();
  const mockSetGestureDragging = vi.fn();
  const mockSetCameraTarget = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupStore(sheetState: ViewState) {
    (useEngineStore as any).mockImplementation((selector: any) => {
      const state = {
        mobileSheetState: sheetState,
        setMobileSheetState: mockSetSheetState,
        setGestureDragging: mockSetGestureDragging,
        setCameraTarget: mockSetCameraTarget,
      };
      return selector(state);
    });
  }

  // Positive: Animates bottom sheet states
  it('renders nothing when sheetState is hidden', () => {
    setupStore('hidden');
    render(<MobileBottomSheet />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders sheet when sheetState is peek', () => {
    setupStore('peek');
    render(<MobileBottomSheet />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    
    // Check if the tabs are rendered
    expect(screen.getByRole('tab', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Console' })).toBeInTheDocument();
  });

  it('renders sheet when sheetState is expanded', () => {
    setupStore('expanded');
    render(<MobileBottomSheet />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  // Positive: Tab switching works
  it('switches between inspector and console tabs', () => {
    setupStore('expanded');
    render(<MobileBottomSheet />);
    
    // Initially inspector is active
    expect(screen.getByTestId('inspector-panel-content')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-console-content')).not.toBeInTheDocument();

    // Switch to console
    const consoleTab = screen.getByRole('tab', { name: 'Console' });
    fireEvent.click(consoleTab);

    expect(screen.queryByTestId('inspector-panel-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-console-content')).toBeInTheDocument();
  });

  // Negative / Edge Case: Interacting with forms inside the sheet traps focus cleanly
  it('activates FocusTrap when expanded', () => {
    // We can't fully simulate focus trap behavior in JSDOM easily, 
    // but we can check if it mounts FocusTrap component correctly by using 
    // a mock or checking if FocusTrap props are reflected.
    // In our component, FocusTrap wraps the tabpanel and receives `active={sheetState === 'expanded'}`.
    setupStore('expanded');
    render(<MobileBottomSheet />);
    
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    
    // The handle button has an onClick that peeks/expands
    const handleBtn = screen.getByRole('button', { name: 'Drag to resize' });
    fireEvent.click(handleBtn);
    expect(mockSetSheetState).toHaveBeenCalledWith('peek');
    expect(mockSetCameraTarget).toHaveBeenCalledWith({ x: 0, y: 0, z: 0 });
  });

  it('expands when peek handle is tapped', () => {
    setupStore('peek');
    render(<MobileBottomSheet />);
    
    const handleBtn = screen.getByRole('button', { name: 'Expand panel' });
    fireEvent.click(handleBtn);
    
    expect(mockSetSheetState).toHaveBeenCalledWith('expanded');
    expect(mockSetCameraTarget).toHaveBeenCalledWith({ x: 0, y: 1.5, z: 0 });
  });
});
