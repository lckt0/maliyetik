import { fetchFileBlob, safeFilename } from './download';

/**
 * Evrak dosyasını cihazın paylaşım sayfasıyla (WhatsApp, e-posta, Dosyalar…) paylaşır.
 *
 * Web Share API "level 2" (dosya paylaşımı) yalnızca güvenli bağlamda ve bazı
 * tarayıcılarda vardır; desteklenmiyorsa `false` döner ve çağıran taraf indirmeye
 * düşer. Kullanıcının paylaşım sayfasını kapatması hata değildir — sessizce yutulur.
 */
export async function shareFile(fileUrl: string, fileName: string, title?: string): Promise<boolean> {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };
  if (!nav.share || !nav.canShare) return false;

  const blob = await fetchFileBlob(fileUrl);
  const file = new File([blob], safeFilename(fileName), { type: blob.type || 'application/octet-stream' });
  if (!nav.canShare({ files: [file] })) return false;

  try {
    await nav.share({ files: [file], title });
    return true;
  } catch (err) {
    // AbortError: kullanıcı paylaşım sayfasını kapattı — hata değil.
    if ((err as DOMException)?.name === 'AbortError') return true;
    return false;
  }
}

/** Dosya paylaşımı bu tarayıcıda mümkün mü — düğmeyi göstermeden önce bakılır. */
export function canShareFiles(): boolean {
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: unknown };
  if (!nav.share || !nav.canShare) return false;
  try {
    // Boş bir File ile yetenek testi: bazı tarayıcılar `share` sunar ama dosyayı reddeder.
    return nav.canShare({ files: [new File([new Blob(['x'])], 'test.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}
