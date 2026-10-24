export function relativeTime(ts: number | string): string {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} sa önce`;
  return `${Math.round(diffH / 24)} gün önce`;
}
