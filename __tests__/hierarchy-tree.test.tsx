import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HierarchyTree } from '@/components/hierarchy-tree';
import { useEngineStore } from '@/store/useEngineStore';
import * as fileTreeData from '@/data/fileTree';

// Mock the store
vi.mock('@/store/useEngineStore', () => ({
  useEngineStore: vi.fn(),
}));

// Mock the icon to avoid rendering issues with lucide-react
const MockIcon = () => <div data-testid="mock-icon" />;

describe('HierarchyTree', () => {
  const mockSetActiveFile = vi.fn();
  let mockFileTree: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    (useEngineStore as any).mockImplementation((selector: any) => {
      const state = {
        activeFileId: null,
        setActiveFile: mockSetActiveFile,
      };
      return selector(state);
    });

    // Mock FILE_TREE
    mockFileTree = [
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
      {
        id: 'file-2',
        label: 'File 2',
        isFolder: false,
        icon: MockIcon,
      },
    ];

    vi.spyOn(fileTreeData, 'FILE_TREE', 'get').mockReturnValue(mockFileTree as any);
  });

  // Positive: Nested file nodes render according to nested data structures.
  it('renders nested file nodes according to data structures', () => {
    render(<HierarchyTree />);
    expect(screen.getByText('Folder 1')).toBeInTheDocument();
    expect(screen.getByText('File 1')).toBeInTheDocument();
    expect(screen.getByText('File 2')).toBeInTheDocument();
  });

  // Positive: Click events toggle specific expanded folder UI states.
  it('toggles folder expanded states on click', () => {
    render(<HierarchyTree />);
    const folderButton = screen.getByRole('treeitem', { name: /Folder 1/i }).querySelector('button');
    
    // Initially expanded by default
    expect(screen.getByRole('treeitem', { name: /Folder 1/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('File 1')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(folderButton!);
    expect(screen.getByRole('treeitem', { name: /Folder 1/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('File 1')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(folderButton!);
    expect(screen.getByRole('treeitem', { name: /Folder 1/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('File 1')).toBeInTheDocument();
  });

  // Positive: Selecting a file leaf correctly dispatches setActiveFile with corresponding ID.
  it('dispatches setActiveFile when a file leaf is selected', () => {
    render(<HierarchyTree />);
    const file1Button = screen.getByRole('button', { name: 'File 1' });
    fireEvent.click(file1Button);

    expect(mockSetActiveFile).toHaveBeenCalledWith('file-1', undefined);
  });

  // Negative / Edge Case: Rendering infinite/recursive file data catches recursive loop or max-depth constraints
  it('handles deep tree structures without crashing', () => {
    mockFileTree = [
      {
        id: 'deep-1',
        label: 'Deep 1',
        isFolder: true,
        icon: MockIcon,
        children: [
          {
            id: 'deep-2',
            label: 'Deep 2',
            isFolder: true,
            icon: MockIcon,
            children: [
              {
                id: 'deep-3',
                label: 'Deep 3',
                isFolder: true,
                icon: MockIcon,
                children: [
                  {
                    id: 'deep-file',
                    label: 'Deep File',
                    isFolder: false,
                    icon: MockIcon,
                  }
                ]
              }
            ]
          }
        ]
      }
    ];
    vi.spyOn(fileTreeData, 'FILE_TREE', 'get').mockReturnValue(mockFileTree as any);

    expect(() => render(<HierarchyTree />)).not.toThrow();
    
    // Deep 1 is root, so it is expanded by default. Deep 2 is visible but collapsed.
    const deep2Btn = screen.getByRole('button', { name: /Deep 2/i });
    fireEvent.click(deep2Btn);
    
    // Now Deep 3 is visible but collapsed.
    const deep3Btn = screen.getByRole('button', { name: /Deep 3/i });
    fireEvent.click(deep3Btn);
    
    // Now Deep File should be visible.
    expect(screen.getByText('Deep File')).toBeInTheDocument();
  });

  // Negative / Edge Case: Providing empty data shows empty list gracefully
  it('renders gracefully when FILE_TREE is empty', () => {
    vi.spyOn(fileTreeData, 'FILE_TREE', 'get').mockReturnValue([]);
    render(<HierarchyTree />);
    expect(screen.queryByRole('treeitem')).not.toBeInTheDocument();
  });
});
