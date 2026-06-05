import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

export type ViewState = 'hidden' | 'peek' | 'expanded';

/** Narrow type for transient state updates — prevents accidentally overwriting reactive state. */
export interface TransientUpdates {
  targetBundleSize?: number;
  isModuleFederationEnabled?: boolean;
  isSloIncidentSimulated?: boolean;
  forceAiState?: 'Patrol' | 'Aggro' | 'Flee';
  showNavMesh?: boolean;
}

interface EngineState {
  // --- REACTIVE STATE (DOM Re-renders Expected) ---
  activeFileId: string | null;
  consoleLogs: string[];
  mobileSheetState: ViewState;
  isAssetLoading: boolean;

  setActiveFile: (id: string, logMsg?: string) => void;
  pushLog: (msg: string) => void;
  setMobileSheetState: (state: ViewState) => void;
  setAssetLoading: (status: boolean) => void;

  // --- TRANSIENT STATE (WebGL reads imperatively; bypasses React renders) ---
  // IBM Flex
  targetBundleSize: number;
  // Indeed Flex
  isModuleFederationEnabled: boolean;
  isSloIncidentSimulated: boolean;
  // HammerBall Flex
  forceAiState: 'Patrol' | 'Aggro' | 'Flee';
  showNavMesh: boolean;

  // TODO: Phase 3 — add cameraTarget: THREE.Vector3 when three.js is installed

  setTransientState: (updates: TransientUpdates) => void;
  // TODO: Phase 3 — add setCameraTarget: (target: THREE.Vector3) => void
  resetStore: () => void;
}

export const useEngineStore = create<EngineState>()(
  devtools(
    subscribeWithSelector((set, _get, store) => ({
      // --- Reactive defaults ---
      activeFileId: null,
      consoleLogs: [],
      mobileSheetState: 'hidden' as ViewState,
      isAssetLoading: false,

      // --- Reactive actions ---
      setActiveFile: (id, logMsg) =>
        set(
          (state) => ({
            activeFileId: id,
            isAssetLoading: true,
            consoleLogs: logMsg
              ? [...state.consoleLogs, logMsg].slice(-100)
              : state.consoleLogs,
          }),
          undefined,
          'reactive/setActiveFile'
        ),

      pushLog: (msg) =>
        set(
          (state) => ({
            consoleLogs: [...state.consoleLogs, msg].slice(-100),
          }),
          undefined,
          'reactive/pushLog'
        ),

      setMobileSheetState: (state) =>
        set({ mobileSheetState: state }, undefined, 'reactive/setMobileSheetState'),
      setAssetLoading: (status) =>
        set({ isAssetLoading: status }, undefined, 'reactive/setAssetLoading'),

      // --- Transient defaults ---
      targetBundleSize: 6.0,
      isModuleFederationEnabled: false,
      isSloIncidentSimulated: false,
      forceAiState: 'Patrol' as const,
      showNavMesh: false,

      // --- Transient actions ---
      setTransientState: (updates) =>
        set(updates, undefined, 'transient/update'),

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
