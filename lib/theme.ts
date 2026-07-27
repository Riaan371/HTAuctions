import { useThemeStore } from './theme-store';

export const Colors = {
  primary: '#E07B39',    // HT Auctions Orange
  navy: '#0D1B2E',       // Dark Navy (headers, dark sections)
  navyMid: '#1B2B4B',   // Mid navy
  gold: '#E07B39',       // Orange (replaces gold)
  goldLight: '#F4A261',  // Light orange
  success: '#16A34A',
  danger: '#DC2626',
  ink: '#0F172A',
};

export function useAppTheme() {
  const theme = useThemeStore((s) => s.theme);
  const dark = theme === 'dark';
  return {
    dark,
    theme,
    bg: dark ? '#080E18' : '#F8F7F4',
    card: dark ? '#0D1B2E' : '#ffffff',
    border: dark ? '#1B2B4B' : '#E5E7EB',
    ink: dark ? '#F1F5F9' : '#0F172A',
    muted: dark ? 'rgba(241,245,249,0.45)' : 'rgba(15,23,42,0.5)',
    subtle: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
    input: dark ? '#1B2B4B' : '#F1F5F9',
  };
}
