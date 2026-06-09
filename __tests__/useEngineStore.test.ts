import { describe, test, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../src/store/useEngineStore';

/**
 * Zustand Store Unit Tests — TDD §11
 *
 * Pure store tests using getState() — no renderHook needed.
 * Store is reset to initial state before each test to prevent state leakage.
 */

beforeEach(() => {
  useEngineStore.setState(useEngineStore.getInitialState(), true);
});

describe('useEngineStore', () => {
  test('initial state has "overview" activeFileId and expanded mobileSheetState', () => {
    const state = useEngineStore.getState();
    expect(state.activeFileId).toBe('overview');
    expect(state.consoleLogs).toEqual([]);
    expect(state.isAssetLoading).toBe(false);
    expect(state.isMobileDrawerOpen).toBe(false);
    expect(state.mobileSheetState).toBe('expanded');
  });

  test('setActiveFile updates activeFileId and pushes log', () => {
    useEngineStore.getState().setActiveFile('ibm-staff-swe', '> [PERF] Legacy bundle detected.');

    const state = useEngineStore.getState();
    expect(state.activeFileId).toBe('ibm-staff-swe');
    expect(state.consoleLogs).toHaveLength(1);
    expect(state.consoleLogs[0].msg).toBe('> [PERF] Legacy bundle detected.');
  });

  test('setActiveFile sets isAssetLoading to true', () => {
    useEngineStore.getState().setActiveFile('ibm-staff-swe');

    expect(useEngineStore.getState().isAssetLoading).toBe(true);
  });

  test('setActiveFile without logMsg does not push a log', () => {
    useEngineStore.getState().setActiveFile('ibm-staff-swe');

    expect(useEngineStore.getState().consoleLogs).toHaveLength(0);
  });

  test('pushLog appends a structured log entry', () => {
    useEngineStore.getState().pushLog('> [SYSTEM] Test log');

    const state = useEngineStore.getState();
    expect(state.consoleLogs).toHaveLength(1);
    expect(state.consoleLogs[0].msg).toBe('> [SYSTEM] Test log');
    expect(typeof state.consoleLogs[0].id).toBe('number');
  });

  test('consoleLogs use incrementing IDs (not array index)', () => {
    const { pushLog } = useEngineStore.getState();
    pushLog('First');
    pushLog('Second');
    pushLog('Third');

    const logs = useEngineStore.getState().consoleLogs;
    expect(logs).toHaveLength(3);

    // IDs should be strictly increasing
    expect(logs[1].id).toBeGreaterThan(logs[0].id);
    expect(logs[2].id).toBeGreaterThan(logs[1].id);

    // IDs should be unique
    const ids = logs.map((l) => l.id);
    expect(new Set(ids).size).toBe(3);
  });

  test('pushLog caps at 100 entries', () => {
    const { pushLog } = useEngineStore.getState();

    for (let i = 0; i < 110; i++) {
      pushLog(`Log #${i}`);
    }

    const logs = useEngineStore.getState().consoleLogs;
    expect(logs).toHaveLength(100);

    // First entry should be Log #10 (oldest 10 were dropped)
    expect(logs[0].msg).toBe('Log #10');
    // Last entry should be Log #109
    expect(logs[99].msg).toBe('Log #109');
  });

  test('setTransientState updates transient fields without touching reactive state', () => {
    useEngineStore.getState().setTransientState({
      targetBundleSize: 2.5,
      isModuleFederationEnabled: true,
    });

    const state = useEngineStore.getState();
    expect(state.targetBundleSize).toBe(2.5);
    expect(state.isModuleFederationEnabled).toBe(true);
    // Reactive state unchanged
    expect(state.activeFileId).toBe('overview');
  });

  test('setTransientState updates AI state fields', () => {
    useEngineStore.getState().setTransientState({
      forceAiState: 'Aggro',
      showNavMesh: true,
    });

    const state = useEngineStore.getState();
    expect(state.forceAiState).toBe('Aggro');
    expect(state.showNavMesh).toBe(true);
  });

  test('setCameraTarget updates camera position', () => {
    useEngineStore.getState().setCameraTarget({ x: 1, y: 2, z: 3 });

    expect(useEngineStore.getState().cameraTarget).toEqual({ x: 1, y: 2, z: 3 });
  });

  test('setMobileSheetState transitions between view states', () => {
    useEngineStore.getState().setMobileSheetState('peek');
    expect(useEngineStore.getState().mobileSheetState).toBe('peek');

    useEngineStore.getState().setMobileSheetState('expanded');
    expect(useEngineStore.getState().mobileSheetState).toBe('expanded');

    useEngineStore.getState().setMobileSheetState('hidden');
    expect(useEngineStore.getState().mobileSheetState).toBe('hidden');
  });

  test('setMobileDrawerOpen toggles drawer state', () => {
    useEngineStore.getState().setMobileDrawerOpen(true);
    expect(useEngineStore.getState().isMobileDrawerOpen).toBe(true);

    useEngineStore.getState().setMobileDrawerOpen(false);
    expect(useEngineStore.getState().isMobileDrawerOpen).toBe(false);
  });

  test('setGestureDragging tracks drag state', () => {
    useEngineStore.getState().setGestureDragging(true);
    expect(useEngineStore.getState().isGestureDragging).toBe(true);
  });

  test('resetStore restores initial state', () => {
    // Mutate several fields
    useEngineStore.getState().setActiveFile('hammerball', '> [SERVER] Match started.');
    useEngineStore.getState().setTransientState({ targetBundleSize: 1.0 });
    useEngineStore.getState().setMobileSheetState('expanded');
    useEngineStore.getState().setMobileDrawerOpen(true);
    useEngineStore.getState().setTransientState({ combatSystemPattern: 'galaxy' });

    // Verify mutations took effect
    expect(useEngineStore.getState().activeFileId).toBe('hammerball');
    expect(useEngineStore.getState().targetBundleSize).toBe(1.0);

    // Reset
    useEngineStore.getState().resetStore();

    // Verify reset
    const state = useEngineStore.getState();
    expect(state.activeFileId).toBe('overview');
    expect(state.consoleLogs).toEqual([]);
    expect(state.targetBundleSize).toBe(6.0);
    expect(state.mobileSheetState).toBe('expanded');
    expect(state.isMobileDrawerOpen).toBe(false);
    expect(state.isAssetLoading).toBe(false);
    expect(state.forceAiState).toBe('Patrol');
    expect(state.showNavMesh).toBe(false);
    expect(state.combatSystemPattern).toBe('fibonacciSphere');
    expect(state.combatSystemFireRate).toBe(0.5);
    expect(state.combatSystemBloom).toBe(1.2);
  });

  test('combat_system transient state defaults', () => {
    const state = useEngineStore.getState();
    expect(state.combatSystemPattern).toBe('fibonacciSphere');
    expect(state.combatSystemFireRate).toBe(0.5);
    expect(state.combatSystemBloom).toBe(1.2);
  });

  test('setTransientState updates combat_system fields', () => {
    useEngineStore.getState().setTransientState({
      combatSystemPattern: 'galaxy',
      combatSystemFireRate: 2.5,
      combatSystemBloom: 0.5,
    });
    const state = useEngineStore.getState();
    expect(state.combatSystemPattern).toBe('galaxy');
    expect(state.combatSystemFireRate).toBe(2.5);
    expect(state.combatSystemBloom).toBe(0.5);
  });

  test('resetStore restores combat_system defaults', () => {
    useEngineStore.getState().setTransientState({
      combatSystemPattern: 'galaxy',
      combatSystemFireRate: 1.5,
      combatSystemBloom: 3.0,
    });
    useEngineStore.getState().resetStore();
    const state = useEngineStore.getState();
    expect(state.combatSystemPattern).toBe('fibonacciSphere');
    expect(state.combatSystemFireRate).toBe(0.5);
    expect(state.combatSystemBloom).toBe(1.2);
  });
});
