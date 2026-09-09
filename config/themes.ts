/** Add a theme here. Components consume semantic CSS variables, never palette values. */
export const themeTokens = [
  'orbit-sun',
  'orbit-land',
  'orbit-night',
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'success',
  'success-background',
  'warning',
  'warning-background',
  'danger-background',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
] as const;
export type ThemeToken = (typeof themeTokens)[number];
export type ThemeDefinition = {
  label: string;
  description: string;
  colors: Record<ThemeToken, string>;
};
const common = {
  'orbit-sun': '#e6b65e',
  'orbit-land': '#94b99f',
  'orbit-night': '#102b27',
  card: '#ffffff',
  'card-foreground': '#21352d',
  popover: '#ffffff',
  'popover-foreground': '#21352d',
  'primary-foreground': '#ffffff',
  secondary: '#e9ede6',
  'secondary-foreground': '#264c3c',
  muted: '#f0f0e9',
  'muted-foreground': '#626d65',
  accent: '#edf2ec',
  'accent-foreground': '#254b38',
  destructive: '#b13535',
  border: '#dedfd4',
  input: '#d3d7cc',
  ring: '#46715b',
  success: '#23603d',
  'success-background': '#e5f2e9',
  warning: '#79521d',
  'warning-background': '#fbf0d9',
  'danger-background': '#fbe9e7',
  'chart-1': '#285e47',
  'chart-2': '#c19a55',
  'chart-3': '#7a9988',
  'chart-4': '#8995a4',
  'chart-5': '#b7b8a2',
};
export const themes = {
  forest: {
    label: 'Forest',
    description: 'The original mosque palette',
    colors: {
      ...common,
      background: '#f7f5ef',
      foreground: '#21352d',
      primary: '#164b3b',
    },
  },
  ocean: {
    label: 'Ocean',
    description: 'Quiet blue and cool white',
    colors: {
      ...common,
      background: '#f2f5f8',
      foreground: '#263c4d',
      primary: '#245777',
      secondary: '#e3edf5',
      'secondary-foreground': '#245777',
      accent: '#e8f0f7',
      'accent-foreground': '#245777',
      ring: '#3e7394',
      'chart-1': '#245777',
    },
  },
  plum: {
    label: 'Plum',
    description: 'A warm, softer alternative',
    colors: {
      ...common,
      background: '#f8f3f5',
      foreground: '#422e3d',
      primary: '#713b60',
      secondary: '#f1e5ec',
      'secondary-foreground': '#713b60',
      accent: '#f4eaf0',
      'accent-foreground': '#713b60',
      ring: '#986586',
      'chart-1': '#713b60',
    },
  },
} satisfies Record<string, ThemeDefinition>;
export type ThemeName = keyof typeof themes;
export const defaultTheme: ThemeName = 'forest';
export const isThemeName = (value: string): value is ThemeName =>
  Object.hasOwn(themes, value);
export function themeVariables(name: ThemeName): Record<string, string> {
  return Object.fromEntries(
    Object.entries(themes[name].colors).map(([key, value]) => [
      `--${key}`,
      value,
    ]),
  );
}
