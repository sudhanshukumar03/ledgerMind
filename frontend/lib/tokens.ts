/**
 * LedgerMind Design Tokens
 *
 * Single source of truth for all colors.
 * Use via inline style={{ color: C.textPrimary }} — NEVER as Tailwind color classes.
 * These map 1:1 to the locked design spec.
 */

export const C = {
  // Backgrounds
  bg:            '#F8FAFC',   // page background
  surface:       '#FFFFFF',   // card / sidebar / topbar / drawer background
  border:        '#E2E8F0',   // default hairline border
  borderStrong:  '#CBD5E1',   // outlined-button border

  // Text
  textPrimary:   '#0F172A',   // headings, primary values, active nav text
  textSecondary: '#475569',   // body copy, secondary labels
  textMuted:     '#64748B',   // meta text, table headers, placeholders (WCAG AA compliant)

  // Primary accent (Teal ramp)
  primary:       '#0F766E',   // teal-700: primary actions, active nav bg tint, links
  primaryTint:   '#F0FDFA',   // teal-50: active nav background, info panel background
  primaryHover:  '#115E59',   // teal-800: button hover state

  // Semantic tones
  success:       '#047857',   // emerald-700: positive status, "matched", confidence text
  successTint:   '#ECFDF5',   // emerald-50: success badge background
  warning:       '#B45309',   // amber-700: warning status
  warningTint:   '#FFFBEB',   // amber-50: warning badge background
  critical:      '#B91C1C',   // red-700: critical status, error, destructive
  criticalTint:  '#FEF2F2',   // red-50: critical badge background
  info:          '#1D4ED8',   // blue-700: medium severity, informational
  infoTint:      '#EFF6FF',   // blue-50: informational badge background

  // Neutral
  neutralTint:   '#F1F5F9',   // neutral chip / progress-track background

  // Focus
  focusRing:     '#0F766E',   // teal-700: keyboard focus rings
} as const;

/** Severity → color mapping helper */
export const severityColor = (severity: string) => {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return { text: C.critical, bg: C.criticalTint };
    case 'HIGH':     return { text: C.warning,  bg: C.warningTint };
    case 'MEDIUM':   return { text: C.info,     bg: C.infoTint };
    case 'LOW':      return { text: C.success,  bg: C.successTint };
    default:         return { text: C.textMuted, bg: C.neutralTint };
  }
};

/** Status → color mapping helper */
export const statusColor = (status: string) => {
  switch (status.toUpperCase()) {
    case 'OPEN':          return { text: C.info,     bg: C.infoTint };
    case 'INVESTIGATING': return { text: C.warning,  bg: C.warningTint };
    case 'RESOLVED':      return { text: C.success,  bg: C.successTint };
    case 'COMPLETED':     return { text: C.success,  bg: C.successTint };
    case 'FAILED':        return { text: C.critical, bg: C.criticalTint };
    case 'IN_PROGRESS':   return { text: C.warning,  bg: C.warningTint };
    case 'PENDING_APPROVAL': return { text: C.warning, bg: C.warningTint };
    case 'APPROVED':      return { text: C.success,  bg: C.successTint };
    case 'REJECTED':      return { text: C.critical, bg: C.criticalTint };
    case 'CAPTURED':      return { text: C.success,  bg: C.successTint };
    case 'CREATED':       return { text: C.textMuted, bg: C.neutralTint };
    case 'PROCESSED':     return { text: C.success,  bg: C.successTint };
    default:              return { text: C.textMuted, bg: C.neutralTint };
  }
};

export type ColorToken = typeof C;
