/**
 * Three.js-accessible design token colors.
 * Values mirror the CSS custom properties in globals.css.
 * Use these instead of hardcoded hex strings in scene files.
 */
export const PALETTE = {
  lime:        '#bff03a',
  cobalt:      '#1f3be0',
  tangerine:   '#ff5e1a',
  ink:         '#161310',
  paper:       '#fffdf7',
  darkPaper:   '#16130f',
  darkSurface: '#211d18',
  darkInk:     '#f4ecdf',
  muted:       '#6b6358',
  darkMuted:   '#a89d8c',
} as const;

export type PaletteColor = keyof typeof PALETTE;
