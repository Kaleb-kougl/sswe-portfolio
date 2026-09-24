import { describe, expect, it } from 'vitest';

import { levelLine, levelOf } from '@/lib/fit';

describe('levelOf', () => {
  it.each([
    ['Staff Software Engineer, Frontend Platform', 'Staff'],
    ['Senior Frontend Engineer', 'Senior'],
    ['Sr. Software Engineer', 'Senior'],
    ['Principal Engineer', 'Principal'],
    ['Software Engineer II', 'Mid-level'],
    ['Junior Web Developer', 'Junior'],
    ['Engineering Manager, Web', 'Management'],
    ['Technical Lead Manager, AI', 'Management'],
    ['Tech Lead, Payments', 'Lead'],
  ])('%s → %s', (title, name) => {
    expect(levelOf(title)?.name).toBe(name);
  });

  it('says nothing for a title with no level', () => {
    expect(levelOf('Software Engineer')).toBeNull();
    expect(levelOf('Role not stated')).toBeNull();
  });
});

describe('levelLine', () => {
  it('places the posting against the newest role in RESUME_DATA', () => {
    expect(levelLine('Staff Software Engineer')).toBe(
      'Level: Staff, one level above my most recent title (Senior Software Engineer, Indeed).',
    );
    expect(levelLine('Senior Full Stack Engineer')).toBe(
      'Level: Senior, the same as my most recent title (Senior Software Engineer, Indeed).',
    );
    expect(levelLine('Software Engineer II')).toBe('Level: Mid-level, below my most recent title (Senior Software Engineer, Indeed).');
    expect(levelLine('Engineering Manager')).toMatch(/^Level: a management role\./);
  });

  it('is absent when the role states no level', () => {
    expect(levelLine('Frontend Engineer')).toBeNull();
  });
});
