/**
 * Shared, presentation-only formatters for turning raw record data (audit state
 * snapshots, AI tool-call payloads) into human-readable text. Pure functions —
 * no React — so they can be used anywhere. Keep this the single source of truth
 * for key/value humanisation across the app.
 */

export const titleCase = (s: string) =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Words that should stay fully upper-cased when they are a standalone token. */
const ACRONYMS = /^(id|ai|url|api|ip|ui)$/i;

/** Turn a field key (camelCase, snake_case, UPPER_CASE) into a readable label. */
export const humanizeKey = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (ACRONYMS.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

/**
 * Column/field label for money fields: the trailing "Paise" unit is noise once
 * the value is rendered as ₹, so drop it (e.g. "Financial Impact Paise" → "Financial Impact").
 */
export const humanizeLabel = (s: string) => humanizeKey(s).replace(/\s*Paise$/i, '');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MONEY_KEY = /(amount|impact|exposure|balance|fee|total|refund|paise)/i;

/** Render one field value in a human-readable form (no raw JSON). */
export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  // Amounts are stored as integer paise; Prisma / the API serialize them as
  // numbers or decimal strings, so handle both.
  if (MONEY_KEY.test(key) && ((typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^-?\d+$/.test(value)))) {
    return `₹${(Number(value) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (typeof value === 'number') return value.toLocaleString('en-IN');
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleString('en-IN');
    }
    if (/^[A-Z][A-Z0-9_]+$/.test(value)) return titleCase(value); // enum-like
    return value;
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => formatValue(key, v)).join(', ') : '—';
  }
  // Nested object: compact "Label: value" summary rather than JSON braces.
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${humanizeKey(k)}: ${formatValue(k, v)}`)
    .join(' · ');
}

export function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Opaque identifiers (UUIDs, *Id / *Key fields) read better in monospace. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isIdentifier(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (UUID_RE.test(value)) return true;
  // Match the last word of the key (handles camelCase, snake_case, UPPER_CASE).
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().split(/\s+/);
  const last = (words[words.length - 1] || '').toLowerCase();
  return last === 'id' || last === 'key';
}

/** True when `value` is a money field by key name and a whole-number paise amount. */
export function isMoney(key: string, value: unknown): boolean {
  return MONEY_KEY.test(key) && ((typeof value === 'number' && Number.isInteger(value)) || (typeof value === 'string' && /^-?\d+$/.test(value)));
}
