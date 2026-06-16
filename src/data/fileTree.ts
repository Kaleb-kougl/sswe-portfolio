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
  Package,
  FlaskConical,
  Home,
  Gamepad2,
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
    id: 'about-me',
    label: '01_About_Me',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'overview', label: 'Overview.md', icon: Home },
      { id: 'profile', label: 'Kaleb_Kougl_Summary.json', icon: User },
      { id: 'contact-info', label: 'Contact_Info.grpc', icon: Globe },
    ],
  },
  {
    id: 'experience',
    label: '02_Experience',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'indeed-sr-swe', label: 'Level_4_Indeed_Sr_SWE.config', icon: Building2 },
      { id: 'ibm-staff-swe', label: 'Level_3_IBM_Staff_SWE.tsx', icon: Building },
      { id: 'ibm-swe', label: 'Level_2_IBM_SWE.gql', icon: Building },
      { id: 'jbhunt-intern', label: 'Level_1_JBHunt_Intern.jsx', icon: Truck },
    ],
  },
  {
    id: 'projects',
    label: '03_Projects',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'hammerball', label: 'BonkBall.exe', icon: Hammer },
      { id: 'analytics-extension', label: 'Indeed_Analytics_Chrome_Extension.crx', icon: Puzzle },
      { id: 'combat_system', label: 'Combat_System.three', icon: Gamepad2 },
    ],
  },
  {
    id: 'skills',
    label: '04_Skills',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'webpack-federation', label: 'Webpack5_Federation.ts', icon: Settings },
      { id: 'cwv-profiler', label: 'Core_Web_Vitals_Profiler.ts', icon: BarChart3 },
    ],
  },
  {
    id: 'publications',
    label: '05_Publications',
    icon: Folder,
    isFolder: true,
    children: [
      { id: 'roblox-css', label: 'Roblox_CSS_v0.1.0.npm', icon: Package },
      { id: 'r3f-projectiles', label: 'R3F_Projectiles.npm', icon: Package },
      { id: 'acs-microdialysis', label: 'ACS_Anal_Chem_2019.doi', icon: FlaskConical },
    ],
  },
];
