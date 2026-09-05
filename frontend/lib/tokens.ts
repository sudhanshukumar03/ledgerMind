/**
 * LedgerMind Design Tokens
 *
 * Single source of truth for all colors.
 * Use via inline style={{ color: C.textPrimary }} — NEVER as Tailwind color classes.
 * These map 1:1 to the locked design spec.
 */

export const C = {
  // Backgrounds
  bg:            'var(--bg)',   
  surface:       'var(--surface)',   
  border:        'var(--border)',   
  borderStrong:  'var(--borderStrong)',   

  // Text
  textPrimary:   'var(--textPrimary)',   
  textSecondary: 'var(--textSecondary)',   
  textMuted:     'var(--textMuted)',   

  // Primary accent
  primary:       'var(--primary)',   
  primaryTint:   'var(--primaryTint)',   
  primaryHover:  'var(--primaryHover)',   

  // Semantic tones
  success:       'var(--success)',   
  successTint:   'var(--successTint)',   
  warning:       'var(--warning)',   
  warningTint:   'var(--warningTint)',   
  critical:      'var(--critical)',   
  criticalTint:  'var(--criticalTint)',   
  info:          'var(--info)',   
  infoTint:      'var(--infoTint)',   

  // Neutral
  neutralTint:   'var(--neutralTint)',   

  // Focus
  focusRing:     'var(--focusRing)',   
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
