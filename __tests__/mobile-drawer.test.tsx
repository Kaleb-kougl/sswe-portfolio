import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MobileDrawer } from '@/components/mobile/mobile-drawer';
import { useEngineStore } from '@/store/useEngineStore';
import * as fileTreeData from '@/data/fileTree';

// Mock the store
vi.mock('@/store/useEngineStore', () => ({
  useEngineStore: vi.fn(),
}));

// Mock the icon to avoid rendering issues with lucide-react
const MockIcon = () => <div data-testid="mock-icon" />;

describe('MobileDrawer', () => {
  const mockSetDrawerOpen = vi.fn();
  const mockSetActiveFile = vi.fn();
  const mockSetSheetState = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.spyOn(fileTreeData, 'FILE_TREE', 'get').mockReturnValue([
      {
        id: 'folder-1',
        label: 'Folder 1',
        isFolder: true,
        icon: MockIcon,
        children: [
          {
            id: 'file-1',
            label: 'File 1',
            isFolder: false,
            icon: MockIcon,
          },
        ],
      },
    ] as any);
  });

  function setupStore(isOpen: boolean, activeFileId: string | null = null) {
    (useEngineStore as any).mockImplementation((selector: any) => {
      const state = {
        isMobileDrawerOpen: isOpen,
        setMobileDrawerOpen: mockSetDrawerOpen,
        setActiveFile: mockSetActiveFile,
        setMobileSheetState: mockSetSheetState,
        activeFileId,
      };
      return selector(state);
    });
  }

  // Positive: Animates drawer states visually mapping to isMobileDrawerOpen
  it('renders drawer when isMobileDrawerOpen is true', () => {
    setupStore(true);
    render(<MobileDrawer />);
    
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hierarchy')).toBeInTheDocument();
    expect(screen.getByText('Folder 1')).toBeInTheDocument();
  });

  it('does not render drawer when isMobileDrawerOpen is false', () => {
    setupStore(false);
    render(<MobileDrawer />);
    
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Positive: Tap actions onto overlay dispatch setMobileDrawerOpen(false) effectively
  it('dispatches setMobileDrawerOpen(false) when backdrop is clicked', async () => {
    setupStore(true);
    render(<MobileDrawer />);
    
    // The backdrop has aria-hidden="true" and no role, so we can find it by test ID or checking classes.
    // It's the first child with class bg-black
    // Wait for animation frame or just grab the first div
    const backdrop = document.querySelector('.bg-black');
    expect(backdrop).toBeInTheDocument();
    
    fireEvent.click(backdrop!);
    
    await waitFor(() => {
      expect(mockSetDrawerOpen).toHaveBeenCalledWith(false);
    });
  });

  it('dispatches setMobileDrawerOpen(false) when close button is clicked', async () => {
    setupStore(true);
    render(<MobileDrawer />);
    
    const closeBtn = screen.getByRole('button', { name: 'Close hierarchy drawer' });
    fireEvent.click(closeBtn);
    
    await waitFor(() => {
      expect(mockSetDrawerOpen).toHaveBeenCalledWith(false);
    });
  });

  // Positive: Selecting file sets active file, closes drawer, sets sheet state
  it('handles file selection correctly', async () => {
    setupStore(true);
    render(<MobileDrawer />);
    
    const file1 = screen.getByText('File 1');
    fireEvent.click(file1);
    
    await waitFor(() => {
      expect(mockSetActiveFile).toHaveBeenCalled();
      expect(mockSetDrawerOpen).toHaveBeenCalledWith(false);
      expect(mockSetSheetState).toHaveBeenCalledWith('peek');
    });
  });
});
