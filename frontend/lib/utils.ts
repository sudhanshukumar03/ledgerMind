import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Standard shadcn/ui class merger
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats BigInt or string paise into an Indian Rupee string (e.g., ₹50,000.00).
 * Handles null/undefined gracefully.
 */
export function formatPaise(value: string | bigint | null | undefined): string {
  if (value == null) return '—';
  
  // Safe parsing to BigInt
  let paise: bigint;
  try {
    paise = typeof value === 'string' ? BigInt(value) : value;
  } catch {
    return '—';
  }

  const isNegative = paise < BigInt(0);
  const absolutePaise = isNegative ? -paise : paise;
  
  const rupees = absolutePaise / BigInt(100);
  const remainder = absolutePaise % BigInt(100);
  
  const formattedRupees = new Intl.NumberFormat('en-IN').format(rupees);
  const formattedRemainder = remainder.toString().padStart(2, '0');
  
  return `${isNegative ? '-' : ''}₹${formattedRupees}.${formattedRemainder}`;
}

/**
 * Formats BigInt or string paise into a compact Indian Rupee string (e.g., ₹4.2L).
 * Uses integer math to avoid precision loss.
 */
export function formatPaiseCompact(value: string | bigint | null | undefined): string {
  if (value == null) return '—';
  
  let paise: bigint;
  try {
    paise = typeof value === 'string' ? BigInt(value) : value;
  } catch {
    return '—';
  }

  const isNegative = paise < BigInt(0);
  const absolutePaise = isNegative ? -paise : paise;
  const rupees = absolutePaise / BigInt(100);

  const sign = isNegative ? '-' : '';

  // 1 Crore = 10,000,000 Rupees
  if (rupees >= BigInt(10000000)) {
    const cr = rupees / BigInt(1000000); // Get tenths of a crore
    const crValue = Number(cr) / 10;
    return `${sign}₹${crValue}Cr`;
  }
  
  // 1 Lakh = 100,000 Rupees
  if (rupees >= BigInt(100000)) {
    const lk = rupees / BigInt(10000); // Get tenths of a lakh
    const lkValue = Number(lk) / 10;
    return `${sign}₹${lkValue}L`;
  }
  
  // 1 Thousand = 1,000 Rupees
  if (rupees >= BigInt(1000)) {
    const th = rupees / BigInt(100); // Get tenths of a thousand
    const thValue = Number(th) / 10;
    return `${sign}₹${thValue}K`;
  }

  return formatPaise(paise).split('.')[0]; // just return whole rupees if < 1000
}

/**
 * Consistently formats event times
 */
export function formatEventTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return '—';
  }
}
