/** Bayt değerini KB/MB/GB gibi okunur bir birime çevirir. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: value < 10 ? 2 : 1 })} ${units[i]}`;
}
