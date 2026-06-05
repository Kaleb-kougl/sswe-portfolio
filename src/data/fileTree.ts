import { type LucideIcon } from 'lucide-react';
import {
  Folder,
  User,
  Globe,
  Building2,
  Building,
  Truck,
  Hammer,
  Puzzle,
  Settings,
  BarChart3,
} from 'lucide-react';

export interface FileNode {
  id: string;
  label: string;
  icon: LucideIcon;
  isFolder?: boolean;
  children?: FileNode[];
}

export const FILE_TREE: FileNode[] = [
  {
    id: 'player-entity',
    label: '01_Player_Entity',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'profile', label: 'Kaleb_Kougl_Profile.json', icon: User },
      { id: 'network-config', label: 'Network_Config.grpc', icon: Globe },
    ],
  },
  {
    id: 'platform-architecture',
    label: '02_Platform_Architecture',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'indeed-onehost', label: 'Level_4_Indeed_OneHost.config', icon: Building2 },
      { id: 'ibm-modernization', label: 'Level_3_IBM_Modernization.tsx', icon: Building },
      { id: 'ibm-golftv', label: 'Level_2_IBM_GolfTV.gql', icon: Building },
      { id: 'jbhunt-mobile', label: 'Level_1_JBHunt_Mobile.jsx', icon: Truck },
    ],
  },
  {
    id: 'game-logic',
    label: '03_Game_Logic',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'hammerball', label: 'HammerBall_LiveOps.exe', icon: Hammer },
      { id: 'analytics-extension', label: 'Indeed_Analytics_ManifestV3.crx', icon: Puzzle },
    ],
  },
  {
    id: 'core-dependencies',
    label: '04_Core_Dependencies',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'webpack-federation', label: 'Webpack5_Federation.ts', icon: Settings },
      { id: 'cwv-profiler', label: 'Core_Web_Vitals_Profiler.ts', icon: BarChart3 },
    ],
  },
];
