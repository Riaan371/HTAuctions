import { useThemeStore } from './theme-store';

export const Colors = {
  primary: '#D9A441',    // HT Auctions Amber — the one accent
  navy: '#17293D',       // Slate Navy (headers, dark sections)
  navyMid: '#23384F',    // Mid navy
  gold: '#D9A441',       // alias to primary, kept for existing references
  goldLight: '#E8C077',  // Light amber
  success: '#16A34A',    // semantic: winning / approved
  danger: '#C1432E',     // semantic: live / urgent / error
  ink: '#17293D',
};

export function useAppTheme() {
  const theme = useThemeStore((s) => s.theme);
  const dark = theme === 'dark';
  return {
    dark,
    theme,
    bg: dark ? '#0F1B29' : '#F5F6F4',
    card: dark ? '#17293D' : '#ffffff',
    border: dark ? '#243A52' : '#E1E4DF',
    ink: dark ? '#F1F5F9' : '#17293D',
    muted: dark ? 'rgba(241,245,249,0.45)' : 'rgba(23,41,61,0.5)',
    subtle: dark ? 'rgba(255,255,255,0.06)' : 'rgba(23,41,61,0.04)',
    input: dark ? '#23384F' : '#F1F5F9',
  };
}
