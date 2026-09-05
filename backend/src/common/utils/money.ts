export function formatPaise(paise: string | bigint | number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';

  let value: bigint;
  try {
    value = typeof paise === 'string' || typeof paise === 'number' ? BigInt(Math.floor(Number(paise))) : BigInt(paise);
  } catch (err) {
    return '—';
  }

  const isNegative = value < 0n;
  const absValue = isNegative ? -value : value;
  const rupees = Number(absValue) / 100;
  
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(rupees);

  return isNegative ? `-${formatted}` : formatted;
}
