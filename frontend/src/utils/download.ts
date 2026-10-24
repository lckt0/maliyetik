import JSZip from 'jszip';
import { api, apiGet } from '../api/client';
import { DocumentRow, Paginated } from '../types';

/**
 * Evrak dosyasını gerçek bir indirme olarak tetikler. `fileUrl` imzasız/parametresiz
 * bir uygulama ucudur (bkz. backend `GET /documents/:id/file`) — depolama sağlayıcısı
 * hiç görünmez. Authenticated axios ile blob olarak alınır, sonra geçici bir `object URL`
 * ile senkron bir `<a download>` tıklaması tetiklenir; URL hemen sonra serbest bırakılır.
 */
export async function downloadDocument(endpoint: '/documents' | '/company-documents', id: string): Promise<void> {
  const detail = await api.get<{ data: DocumentRow }>(`${endpoint}/${id}`).then((r) => r.data.data);
  if (!detail.fileUrl) return;
  const blob = await fetchFileBlob(detail.fileUrl);
  triggerBlobDownload(blob, safeFilename(detail.originalName || detail.title));
}

/**
 * Bir blob'u geçici `object URL` üzerinden `<a download>` tıklamasıyla indirir ve
 * URL'i hemen serbest bırakır (aksi halde blob sekme kapanana kadar bellekte kalır).
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Sunucudan gelen dosya adını indirme/arşiv girişi olarak kullanmadan önce temizler.
 * Dizin ayracı ve `..` içeren bir `originalName`, zip içinde beklenmedik bir yola
 * (zip-slip ailesi) veya indirmede yanıltıcı bir ada dönüşebilir — yol bileşenleri
 * atılır, kalan ad güvenli karakterlere indirgenir.
 */
export function safeFilename(name: string, fallback = 'dosya'): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f<>:"|?*]/g, '') // kontrol karakterleri + Windows'ta gecersiz olanlar
    .replace(/^\.+/, '') // bastaki noktalar ("..", gizli dosya) atilir
    .trim();
  return cleaned || fallback;
}

/** Önizleme/indirme için dosyayı authenticated blob olarak çeker (imzasız uç, bkz. yukarısı). */
export async function fetchFileBlob(fileUrl: string): Promise<Blob> {
  const res = await api.get(fileUrl, { responseType: 'blob' });
  return res.data as Blob;
}

/** Aynı ada birden fazla dosya düşerse (ör. uzantısız/aynı başlıklı evraklar) "-2", "-3" ekler. */
function uniqueFilename(used: Set<string>, name: string): string {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  let candidate = `${base}-${i}${ext}`;
  while (used.has(candidate)) { i += 1; candidate = `${base}-${i}${ext}`; }
  used.add(candidate);
  return candidate;
}

/** `/documents` ucunun izin verdiği en büyük sayfa boyutu (bkz. PageQueryDto). */
const ZIP_PAGE_SIZE = 100;
/** 5000 evrak — gerçekçi bir fiş grubunun çok üstünde; sonsuz döngüye karşı sınır. */
const MAX_ZIP_PAGES = 50;

/**
 * Bir Fiş Grubu'ndaki (sayfalama olmadan, TÜMÜ) evrakları tek bir zip olarak indirir.
 * Sunucu tarafında zip oluşturma yok — her dosya mevcut `GET /documents/:id/file` ucundan
 * (imzasız, authenticated blob) tek tek çekilip tarayıcıda `jszip` ile paketlenir; Mali
 * Hafıza Raporu içe aktarımından gelen bir grup gibi tüm üyeler aynı fotoğrafı paylaşıyorsa
 * bile her evrak kendi (aynı içerikli) dosyasıyla zip'e girer — kullanıcı grup sayfasında
 * gördüğü kadar dosya bulur.
 */
export async function downloadGroupZip(
  endpoint: '/documents' | '/company-documents',
  documentTypeId: number,
  groupNo: string,
  taxpayerId: string | null,
  label: string,
): Promise<void> {
  // `/documents` limit'i en fazla 100 (bkz. PageQueryDto @Max(100)) — tek istekte 500
  // istemek 100'den büyük her grupta 400 döndürüyordu. Tüm sayfalar döngüyle çekilir.
  const items: DocumentRow[] = [];
  for (let page = 1; page <= MAX_ZIP_PAGES; page += 1) {
    const params: Record<string, string | number> = { documentTypeId, groupNo, limit: ZIP_PAGE_SIZE, page };
    if (taxpayerId) params.taxpayerId = taxpayerId;
    const res = await apiGet<Paginated<DocumentRow>>(endpoint, params);
    items.push(...res.items);
    if (res.items.length < ZIP_PAGE_SIZE) break;
    if (page === MAX_ZIP_PAGES) {
      throw new Error('Fiş grubu beklenenden büyük, zip olarak indirilemedi.');
    }
  }
  if (!items.length) throw new Error('Grup boş görünüyor.');

  const zip = new JSZip();
  const used = new Set<string>();
  for (const doc of items) {
    // Liste satırlarında `fileUrl` yok (yalnızca tekil `GET :id` ekler) — uç zaten sabit
    // desende (`bkz. DocumentsService.getWithUrl`), doğrudan kurulur.
    const blob = await fetchFileBlob(`${endpoint}/${doc.id}/file`);
    const name = uniqueFilename(used, safeFilename(doc.originalName || `${doc.title}.bin`));
    zip.file(name, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(content, `${label.replace(/[^\w.\-]+/g, '_')}.zip`);
}
