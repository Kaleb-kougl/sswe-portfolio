import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MobileHierarchyDropdown } from '@/components/mobile/mobile-drawer';
import { useEngineStore } from '@/store/useEngineStore';
import * as fileTreeData from '@/data/fileTree';

// Mock the store
vi.mock('@/store/useEngineStore', () => ({
  useEngineStore: vi.fn(),
}));

// Mock the icon to avoid rendering issues with lucide-react
const MockIcon = () => <div data-testid="mock-icon" />;

/**
 * The mobile Hierarchy is no longer a full-screen slide-out drawer; below 768px
 * the page is a single scroll and the Hierarchy is a sticky dropdown parked
 * under the top bar (MOBILE_SCROLL). The behaviour these tests protect is
 * unchanged — open/closed tracks `isMobileDrawerOpen`, backdrop and close
 * button dismiss, picking a file selects it and closes — so only the names and
 * the post-selection sheet state below were updated to the new intent.
 */
describe('MobileHierarchyDropdown', () => {
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

  // Positive: Animates open/closed states, mapping to isMobileDrawerOpen
  it('renders the popover when isMobileDrawerOpen is true', () => {
    setupStore(true);
    render(<MobileHierarchyDropdown />);
    
    expect(screen.getByRole('dialog', { name: 'Project hierarchy' })).toBeInTheDocument();
    expect(screen.getByRole('tree', { name: 'Project files' })).toBeInTheDocument();
    expect(screen.getByText('Folder 1')).toBeInTheDocument();
  });

  it('does not render the popover when isMobileDrawerOpen is false', () => {
    setupStore(false);
    render(<MobileHierarchyDropdown />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // ...but the sticky trigger is always there, so the tree stays reachable.
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  // Positive: Tap actions onto overlay dispatch setMobileDrawerOpen(false) effectively
  it('dispatches setMobileDrawerOpen(false) when backdrop is clicked', async () => {
    setupStore(true);
    render(<MobileHierarchyDropdown />);
    
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
    render(<MobileHierarchyDropdown />);
    
    const closeBtn = screen.getByRole('button', { name: 'Close hierarchy' });
    fireEvent.click(closeBtn);
    
    await waitFor(() => {
      expect(mockSetDrawerOpen).toHaveBeenCalledWith(false);
    });
  });

  // Positive: Selecting file sets active file, closes drawer, sets sheet state
  it('handles file selection correctly', async () => {
    setupStore(true);
    render(<MobileHierarchyDropdown />);
    
    const file1 = screen.getByText('File 1');
    fireEvent.click(file1);
    
    await waitFor(() => {
      expect(mockSetActiveFile).toHaveBeenCalled();
      expect(mockSetDrawerOpen).toHaveBeenCalledWith(false);
      // 'expanded', not 'peek': the sheet is now DOCKED at peek for the whole
      // session, so peeking on select would look like the tap did nothing.
      expect(mockSetSheetState).toHaveBeenCalledWith('expanded');
    });
  });
});
