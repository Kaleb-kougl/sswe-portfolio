import { describe, expect, it } from 'vitest';

import { CONTACT_INFO } from '@/data/resumeData';
import { runTool } from '@/lib/tools';
import { getProfile } from '@/lib/tools/get-profile';

import { PHONE } from './helpers';

describe('get_profile', () => {
  it('returns who Kaleb is and how to reach him', () => {
    const profile = getProfile.handler({}) as Record<string, unknown> & { links: Record<string, string> };
    expect(profile.name).toBe(CONTACT_INFO.name);
    expect(profile.email).toBe(CONTACT_INFO.email);
    expect(profile.links.contactForm).toMatch(/\/#contact$/);
    expect(profile.roleTargets).not.toHaveLength(0);
  });

  it('never returns the phone number', () => {
    expect(JSON.stringify(runTool('get_profile'))).not.toMatch(PHONE);
  });

  it('tells the model there is no phone number and no send tool', () => {
    expect(getProfile.description).toMatch(/no phone number/i);
    expect(getProfile.description).toMatch(/cannot send/i);
  });
});
