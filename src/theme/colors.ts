/** Ported from lib/theme/app_colors.dart */

export interface AppColors {
  bg: string;
  surface: string;
  surfaceDeep: string;
  accent: string;
  green: string;
  amber: string;
  pink: string;
  textPri: string;
  textMuted: string;
  border: string;
}

export const darkColors: AppColors = {
  bg: '#060D1F',
  surface: '#0D1A2E',
  surfaceDeep: '#0D2535',
  accent: '#00E5FF',
  green: '#00E096',
  amber: '#FFB020',
  pink: '#FF4D8D',
  textPri: '#FFFFFF',
  textMuted: '#6B7A96',
  border: '#1A2640',
};

export const lightColors: AppColors = {
  bg: '#F0F5FF',
  surface: '#FFFFFF',
  surfaceDeep: '#EBF2FF',
  accent: '#0099AA',
  green: '#00875A',
  amber: '#B86800',
  pink: '#B5004F',
  textPri: '#0A1628',
  textMuted: '#5B7090',
  border: '#CDD8F0',
};
