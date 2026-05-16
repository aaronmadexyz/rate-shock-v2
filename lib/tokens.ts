export const TOKENS = {
  // ─── COLORS ───────────────────────────────────────────────────────────────

  colors: {
    // Neutrals
    n0:   '#FFFFFF',
    n25:  '#FAFAF8',
    n50:  '#F5F4F1',
    n100: '#EEEDEA',
    n150: '#E2E1DD',
    n200: '#D4D3CE',
    n300: '#B8B7B1',
    n400: '#767670',
    n500: '#706F67',
    n600: '#5E5D56',
    n700: '#43423D',
    n800: '#2C2B27',
    n900: '#1A1917',

    // Primary — indigo
    p50:  '#EEEFFA',
    p100: '#D5D7F2',
    p200: '#B0B4E6',
    p400: '#636AC5',
    p500: '#4A50B0',
    p600: '#3A3F8F',
    p700: '#2D3170',

    // Positive — sage
    pos50:  '#EDF7F0',
    pos200: '#93D1A2',
    pos400: '#3A9B55',
    pos500: '#2A7D41',
    pos600: '#1F6132',

    // Caution — amber
    cau50:  '#FEF6E8',
    cau200: '#FACA6B',
    cau400: '#D49316',
    cau500: '#AD7710',
    cau600: '#845A0C',

    // Negative — coral
    neg50:  '#FDF0EE',
    neg200: '#F2A597',
    neg400: '#D4503A',
    neg500: '#B33C28',
    neg600: '#8C2E1E',

    // Seal colors — envelope markers on map
    sealPositive:      '#3A9B55',
    sealPositiveShine: '#5CB872',
    sealNeutral:       '#D49316',
    sealNeutralShine:  '#FACA6B',
    sealNegative:      '#D4503A',
    sealNegativeShine: '#F2A597',

    // Paper colors — envelope body
    paperBody: '#F0EDE8',
    paperFlap: '#E6E3DD',

    // Map colors
    mapLand:   '#EEEDEA',
    mapBorder: '#D4D3CE',
    mapWater:  '#F5F4F1',
  },

  // ─── SPACING (4px base) ───────────────────────────────────────────────────

  spacing: {
    sp1:  4,
    sp2:  8,
    sp3:  12,
    sp4:  16,
    sp5:  20,
    sp7:  28,
    sp6:  24,
    sp8:  32,
    sp10: 40,
    sp12: 48,
    sp16: 64,
    sp20: 80,
  },

  // ─── BORDER RADIUS ────────────────────────────────────────────────────────

  radius: {
    rSm:   6,
    rMd:   10,
    rLg:   14,
    rXl:   20,
    rFull: 9999,
  },

  // ─── SHADOWS (warm undertone rgba(26,25,23,...)) ───────────────────────────

  shadows: {
    shadowXs: '0 1px 2px rgba(26,25,23,.04)',
    shadowSm: '0 1px 3px rgba(26,25,23,.06), 0 1px 2px rgba(26,25,23,.04)',
    shadowMd: '0 4px 12px rgba(26,25,23,.06), 0 1px 3px rgba(26,25,23,.04)',
    shadowLg: '0 8px 28px rgba(26,25,23,.08), 0 2px 6px rgba(26,25,23,.04)',
    shadowXl: '0 16px 48px rgba(26,25,23,.10), 0 4px 12px rgba(26,25,23,.04)',
  },

  // ─── TYPOGRAPHY ───────────────────────────────────────────────────────────

  fonts: {
    fontDisplay: "'Inter', system-ui, sans-serif", // with font-variation-settings 'opsz' 32
    fontBody:    "'Inter', system-ui, sans-serif",
    fontMono:    "'IBM Plex Mono', 'SF Mono', monospace",
  },

  // Type scale — size in px, weight, tracking
  typeScale: {
    display: {
      size:       36,
      weight:     600,
      tracking:   '-0.03em',
      lineHeight: 1.1,
      opsz:       32,
    },
    h1: {
      size:       26,
      weight:     600,
      tracking:   '-0.02em',
      lineHeight: 1.25,
    },
    h2: {
      size:     18,
      weight:   600,
      tracking: '-0.01em',
    },
    h3: {
      size:     15,
      weight:   600,
      tracking: '-0.005em',
    },
    body: {
      size:       15,
      weight:     400,
      lineHeight: 1.65,
    },
    caption: {
      size:   13,
      weight: 500,
    },
    dataLabel: {
      size:      11,
      weight:    500,
      tracking:  '0.06em',
      transform: 'uppercase' as const,
      font:      'mono' as const,
    },
    dataValue: {
      size:     32,
      weight:   700,
      tracking: '-0.03em',
      opsz:     32,
    },
    monoInline: {
      size:   13,
      weight: 400,
      font:   'mono' as const,
    },
  },

  // ─── Z-INDEX SCALE ────────────────────────────────────────────────────────

  zIndex: {
    zMap:      0,
    zMarkers:  10,
    zControls: 20,
    zNav:      100,
    zPanel:    200,
    zTooltip:  300,
    zOverlayBg: 400,
    zOverlay:   450,
    zBackdrop:  500,
    zModal:     600,
    zAlert:     700,
  },
} as const;

export type TokenColors   = typeof TOKENS.colors;
export type TokenSpacing  = typeof TOKENS.spacing;
export type TokenRadius   = typeof TOKENS.radius;
export type TokenShadows  = typeof TOKENS.shadows;
export type TokenZIndex   = typeof TOKENS.zIndex;

export const SEMANTIC = {
  text: {
    primary:   TOKENS.colors.n900,
    secondary: TOKENS.colors.n500,
    tertiary:  TOKENS.colors.n400,
    disabled:  TOKENS.colors.n300,
    inverse:   TOKENS.colors.n0,
  },
  surface: {
    primary:   TOKENS.colors.n0,
    secondary: TOKENS.colors.n25,
    tertiary:  TOKENS.colors.n50,
    raised:    TOKENS.colors.n0,
  },
  border: {
    default: TOKENS.colors.n150,
    strong:  TOKENS.colors.n200,
    subtle:  TOKENS.colors.n100,
  },
} as const;
