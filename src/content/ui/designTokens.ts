/**
 * Design tokens — centralized visual constants for the entire extension.
 *
 * All badge, panel, and overlay styles should reference these tokens
 * instead of hardcoded values. Injected as CSS custom properties via
 * the :root-level style block in GLOBAL_STYLES.
 */

// ── Semantic Colors ──────────────────────────────────────────────────

export const COLORS = {
  success: "#067d62",
  warning: "#b06000",
  danger: "#cc0c39",
  info: "#007185",
  neutral: "#565959",
  accent: "#ff9900",

  // Surfaces
  surface0: "#f7f8fa",
  surface1: "#f0f2f2",
  surface2: "#fff",
  border: "#d5d9d9",
  borderLight: "#e0e0e0",

  // Text
  textPrimary: "#0f1111",
  textSecondary: "#565959",
  textMuted: "#888c8c",
  textLink: "#0066c0",
} as const;

// ── Border Radii ─────────────────────────────────────────────────────

export const RADII = {
  sm: "4px",   // inline badges, small pills
  md: "8px",   // panels, cards, containers
  lg: "16px",  // pills, chips, rounded buttons
} as const;

// ── Typography ───────────────────────────────────────────────────────

export const FONT = {
  family: '"Amazon Ember", "Segoe UI", -apple-system, sans-serif',
  xs: "10px",   // captions only
  sm: "11px",   // badges, secondary text
  base: "13px", // body text
  lg: "14px",   // emphasis
  xl: "16px",   // titles
} as const;

// ── Spacing ──────────────────────────────────────────────────────────

export const SPACE = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
} as const;

// ── Shadows ──────────────────────────────────────────────────────────

export const SHADOW = {
  sm: "0 1px 3px rgba(0,0,0,0.08)",
  md: "0 2px 8px rgba(0,0,0,0.15)",
  lg: "0 4px 24px rgba(0,0,0,0.18)",
} as const;

// ── CSS Custom Properties Block ──────────────────────────────────────

/**
 * Inject as part of GLOBAL_STYLES to make tokens available as CSS vars.
 * Components can use var(--bas-success), var(--bas-radius-sm), etc.
 */
export const DESIGN_TOKEN_STYLES = `
:root {
  /* Semantic colors */
  --bas-success: ${COLORS.success};
  --bas-warning: ${COLORS.warning};
  --bas-danger: ${COLORS.danger};
  --bas-info: ${COLORS.info};
  --bas-neutral: ${COLORS.neutral};
  --bas-accent: ${COLORS.accent};

  /* Surfaces */
  --bas-surface-0: ${COLORS.surface0};
  --bas-surface-1: ${COLORS.surface1};
  --bas-surface-2: ${COLORS.surface2};
  --bas-border: ${COLORS.border};
  --bas-border-light: ${COLORS.borderLight};

  /* Text */
  --bas-text-primary: ${COLORS.textPrimary};
  --bas-text-secondary: ${COLORS.textSecondary};
  --bas-text-muted: ${COLORS.textMuted};
  --bas-text-link: ${COLORS.textLink};

  /* Typography */
  --bas-font: ${FONT.family};
  --bas-text-xs: ${FONT.xs};
  --bas-text-sm: ${FONT.sm};
  --bas-text-base: ${FONT.base};
  --bas-text-lg: ${FONT.lg};
  --bas-text-xl: ${FONT.xl};

  /* Spacing */
  --bas-space-1: ${SPACE[1]};
  --bas-space-2: ${SPACE[2]};
  --bas-space-3: ${SPACE[3]};
  --bas-space-4: ${SPACE[4]};
  --bas-space-6: ${SPACE[6]};

  /* Border radii */
  --bas-radius-sm: ${RADII.sm};
  --bas-radius-md: ${RADII.md};
  --bas-radius-lg: ${RADII.lg};

  /* Shadows */
  --bas-shadow-sm: ${SHADOW.sm};
  --bas-shadow-md: ${SHADOW.md};
  --bas-shadow-lg: ${SHADOW.lg};
}
`;

// ── Badge color helpers ──────────────────────────────────────────────

/** Map a semantic label to foreground + background colors. */
export function getBadgeColors(level: "success" | "warning" | "danger" | "info" | "neutral"): {
  fg: string;
  bg: string;
  border: string;
} {
  switch (level) {
    case "success": return { fg: COLORS.success, bg: "#e6f7e6", border: "#c8e6c9" };
    case "warning": return { fg: COLORS.warning, bg: "#fff3e0", border: "#ffe0b2" };
    case "danger":  return { fg: COLORS.danger,  bg: "#fde8e8", border: "#f5c6cb" };
    case "info":    return { fg: COLORS.info,    bg: "#e7f4f7", border: "#b2d8e0" };
    case "neutral": return { fg: COLORS.neutral, bg: COLORS.surface1, border: COLORS.borderLight };
  }
}
