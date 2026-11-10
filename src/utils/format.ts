/** 9321 → "9,321". Avoids Intl so it behaves the same on every device. */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
