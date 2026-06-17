import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import type { CombatSystemPattern } from '@/components/3d/scenes/combat-system-types';

export type ViewState = 'hidden' | 'peek' | 'expanded';

/** Structured console log entry with a stable unique ID for React keying. */
export interface ConsoleLogEntry {
  id: number;
  msg: string;
}

let logCounter = 0;

/** Narrow type for transient state updates — prevents accidentally overwriting reactive state. */
export interface TransientUpdates {
  targetBundleSize?: number;
  isModuleFederationEnabled?: boolean;
  isSloIncidentSimulated?: boolean;
  forceAiState?: 'Patrol' | 'Aggro' | 'Flee';
  showNavMesh?: boolean;
  combatSystemPattern?: CombatSystemPattern;
  combatSystemFireRate?: number;
  combatSystemBloom?: number;
  combatSystemPoolSize?: number;
}

interface EngineState {
  // --- REACTIVE STATE (DOM Re-renders Expected) ---
  activeFileId: string | null;
  consoleLogs: ConsoleLogEntry[];
  mobileSheetState: ViewState;
  isAssetLoading: boolean;
  isMobileDrawerOpen: boolean;
  isGestureDragging: boolean;

  setActiveFile: (id: string, logMsg?: string) => void;
  pushLog: (msg: string) => void;
  setMobileSheetState: (state: ViewState) => void;
  setAssetLoading: (status: boolean) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setGestureDragging: (dragging: boolean) => void;

  // --- TRANSIENT STATE (WebGL reads imperatively; bypasses React renders) ---
  // IBM Flex
  targetBundleSize: number;
  // Indeed Flex
  isModuleFederationEnabled: boolean;
  isSloIncidentSimulated: boolean;
  // HammerBall Flex
  forceAiState: 'Patrol' | 'Aggro' | 'Flee';
  showNavMesh: boolean;

  // Combat System Flex
  combatSystemPattern: CombatSystemPattern;
  combatSystemFireRate: number;
  combatSystemBloom: number;
  combatSystemPoolSize: number;

  // Camera (plain object to avoid importing THREE in the store — preserves SSR safety)
  cameraTarget: { x: number; y: number; z: number };

  setTransientState: (updates: TransientUpdates) => void;
  setCameraTarget: (target: { x: number; y: number; z: number }) => void;
  resetStore: () => void;
}

export const useEngineStore = create<EngineState>()(
  devtools(
    subscribeWithSelector((set, _get, store) => ({
      // --- Reactive defaults ---
      activeFileId: 'overview' as string | null,
      consoleLogs: [] as ConsoleLogEntry[],
      mobileSheetState: 'expanded' as ViewState,
      isAssetLoading: false,
      isMobileDrawerOpen: false,
      isGestureDragging: false,

      // --- Reactive actions ---
      setActiveFile: (id, logMsg) =>
        set(
          (state) => {
            if (state.activeFileId === id) return state;
            return {
              activeFileId: id,
              isAssetLoading: true,
              consoleLogs: logMsg
                ? [...state.consoleLogs, { id: logCounter++, msg: logMsg }].slice(-100)
                : state.consoleLogs,
            };
          },
          undefined,
          'reactive/setActiveFile'
        ),

      pushLog: (msg) =>
        set(
          (state) => ({
            consoleLogs: [...state.consoleLogs, { id: logCounter++, msg }].slice(-100),
          }),
          undefined,
          'reactive/pushLog'
        ),

      setMobileSheetState: (state) =>
        set({ mobileSheetState: state }, undefined, 'reactive/setMobileSheetState'),
      setAssetLoading: (status) =>
        set({ isAssetLoading: status }, undefined, 'reactive/setAssetLoading'),
      setMobileDrawerOpen: (open) =>
        set({ isMobileDrawerOpen: open }, undefined, 'reactive/setMobileDrawerOpen'),
      setGestureDragging: (dragging) =>
        set({ isGestureDragging: dragging }, undefined, 'reactive/setGestureDragging'),

      // --- Transient defaults ---
      targetBundleSize: 6.0,
      isModuleFederationEnabled: false,
      isSloIncidentSimulated: false,
      forceAiState: 'Patrol' as const,
      showNavMesh: false,
      combatSystemPattern: 'fibonacciSphere' as CombatSystemPattern,
      combatSystemFireRate: 0.5,
      combatSystemBloom: 1.2,
      combatSystemPoolSize: 2000,
      cameraTarget: { x: 0, y: 0, z: 0 },

      // --- Transient actions ---
      setTransientState: (updates) =>
        set(updates, undefined, 'transient/update'),
      setCameraTarget: (target) =>
        set({ cameraTarget: { ...target } }, undefined, 'transient/setCameraTarget'),

      // --- Reset ---
      resetStore: () =>
        set(store.getInitialState(), true, 'store/reset'),
    })),
    {
      name: 'EngineStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
