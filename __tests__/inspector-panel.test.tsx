import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InspectorPanel } from '@/components/inspector-panel';
import { useEngineStore } from '@/store/useEngineStore';
import * as resumeData from '@/data/resumeData';

// Mock the store
vi.mock('@/store/useEngineStore', () => ({
  useEngineStore: vi.fn(),
}));

// Mock useReducedMotion
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

describe('InspectorPanel', () => {
  const mockSetTransientState = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupStore(activeFileId: string | null, extraState = {}) {
    (useEngineStore as any).mockImplementation((selector: any) => {
      const state = {
        activeFileId,
        setTransientState: mockSetTransientState,
        ...extraState,
      };
      return selector(state);
    });
  }

  // Positive: Inspector maps tech stack tags, descriptions, and metadata efficiently
  it('maps tech stack tags, descriptions, and metadata when a file is selected', () => {
    setupStore('test_file');
    
    vi.spyOn(resumeData, 'RESUME_DATA', 'get').mockReturnValue({
      test_file: {
        fileId: 'test_file',
        title: 'Test Project',
        company: 'Test Company',
        dates: '2023 - Present',
        type: 'project',
        skills: ['React', 'TypeScript', 'Vitest'],
        bullets: ['Implemented feature X', 'Optimized performance by 50%'],
      }
    } as any);

    render(<InspectorPanel />);

    // Check title, company, dates
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Test Company')).toBeInTheDocument();
    expect(screen.getByText('2023 - Present')).toBeInTheDocument();

    // Check skills
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Vitest')).toBeInTheDocument();

    // Check bullets
    expect(screen.getByText('Implemented feature X')).toBeInTheDocument();
    expect(screen.getByText('Optimized performance by 50%')).toBeInTheDocument();
  });

  // Negative / Edge Case: Inspector receiving files without specific metadata properties gracefully drops missing fields
  it('gracefully handles missing metadata properties without throwing', () => {
    setupStore('partial_file');
    
    vi.spyOn(resumeData, 'RESUME_DATA', 'get').mockReturnValue({
      partial_file: {
        fileId: 'partial_file',
        title: 'Minimal File',
        type: 'work',
        bullets: ['Just one bullet'],
        // Missing company, dates, skills, controls
      }
    } as any);

    expect(() => render(<InspectorPanel />)).not.toThrow();

    expect(screen.getByText('Minimal File')).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
    expect(screen.getByText('Just one bullet')).toBeInTheDocument();
    
    // Ensure company and dates don't break rendering
    const companyElements = screen.queryAllByText(/Company/i);
    // Might match welcome screen text if it wasn't mocked properly, but we rendered a file
    // So there shouldn't be any company specific info
    expect(companyElements.length).toBe(0);
  });

  it('renders welcome view when no file is selected', () => {
    setupStore(null);
    
    vi.spyOn(resumeData, 'CONTACT_INFO', 'get').mockReturnValue({
      name: 'John Doe',
      title: 'Software Engineer',
      location: 'Earth',
      email: 'john@example.com',
      linkedin: 'linkedin.com/in/johndoe',
      github: 'https://github.com/johndoe',
    });

    render(<InspectorPanel />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Select a file from the Hierarchy to inspect.')).toBeInTheDocument();
  });
});
