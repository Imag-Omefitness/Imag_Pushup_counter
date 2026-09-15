// constants/theme.ts
// Escala compartilhada de raio de borda e espaçamento, usada pelos cards,
// badges, pills e modais das telas — evita valores soltos/arbitrários
// repetidos (e levemente diferentes) em cada arquivo.

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;
