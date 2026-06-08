import { describe, it, expect } from 'vitest';
import { getSceneKey } from '../src/components/3d/scene-orchestrator';

describe('scene-orchestrator getSceneKey logic', () => {
  it('maps "about-me" sub-scenes correctly', () => {
    expect(getSceneKey('overview')).toBe('about-me');
    expect(getSceneKey('profile')).toBe('about-me');
    expect(getSceneKey('contact-info')).toBe('about-me');
  });

  it('maps specific flex scene IDs directly to themselves', () => {
    expect(getSceneKey('ibm-staff-swe')).toBe('ibm-staff-swe');
    expect(getSceneKey('indeed-sr-swe')).toBe('indeed-sr-swe');
    expect(getSceneKey('hammerball')).toBe('hammerball');
    expect(getSceneKey('combat_system')).toBe('combat_system');
  });

  it('falls back to "default" for unknown or null file IDs', () => {
    expect(getSceneKey('some-unknown-file')).toBe('default');
    expect(getSceneKey(null)).toBe('default');
    expect(getSceneKey('')).toBe('default');
  });
});
