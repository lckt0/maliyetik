/** `::ffff:1.2.3.4` gibi IPv4-mapped IPv6 önekini soyar — trust proxy sonrası req.ip için savunmacı normalize. */
export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** Bakım modu allowlist kontrolü — hem middleware hem /system/status ucu aynı mantığı kullanır. */
export function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  const normalized = normalizeIp(ip);
  return allowedIps.some((a) => normalizeIp(a) === normalized);
}
