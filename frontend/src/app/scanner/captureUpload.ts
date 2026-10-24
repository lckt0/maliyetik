import { api } from '../../api/client';
import { startBatchUpload } from '../../uploadManager';
import { generateReceiptGroupNo } from '../../utils/receiptGroup';
import { formatDate } from '../../utils/date';

/** Taranmış sayfaların JPEG kalitesi — metin okunaklılığı ile dosya boyutu dengesi. */
const JPEG_QUALITY = 0.86;

/**
 * `ImageData`'yı JPEG dosyaya çevirir. Tarama çıktısı her zaman JPEG'dir:
 * `z_raporu` ve `mali_hafiza_raporu` türlerinin şemasında `fileAccept: "image/*"`
 * var, yani backend bu türlerde PDF'i reddediyor (bkz. DocumentsService.assertFileAccepted).
 * Tek tip çıktı, dört türde de aynı kod yolunun çalışmasını sağlıyor.
 */
export async function imageDataToJpeg(image: ImageData, filename: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.putImageData(image, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('Görüntü işlenemedi.');
  return new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() });
}

interface SaveOptions {
  files: File[];
  documentTypeId: number;
  documentTypeCode: string;
  documentTypeName: string;
  taxpayerId: string;
}

/**
 * Taranan sayfaları kaydeder — HER SAYFA AYRI EVRAK (her biri bir kota tüketir).
 *
 * `quick: true` ile yüklenir: yalnızca tür + dosya kaydedilir, belge no/tutar gibi alanlar
 * boş kalır ve evrak "Evrak Dijitalleştir" kuyruğuna düşer. Mobilde alan girişi istenmiyor;
 * kullanıcı sahada hızlıca tarayıp geçiyor, alanlar sonra web panelinde (elle veya AI ile)
 * tamamlanıyor.
 *
 * Yükleme `uploadManager` üzerinden arka planda yürür: kullanıcı tarama ekranından çıksa
 * da devam eder ve ilerleme Evrak Yükle sayfasında görünmeye devam eder.
 */
export function saveScannedPages({
  files, documentTypeId, documentTypeCode, documentTypeName, taxpayerId,
}: SaveOptions): void {
  // Z-Raporu'nda tüm fişler ay bazında aynı Fiş Grubu'na düşer — masaüstündeki
  // "Evrak Kayıt" ile birebir aynı davranış (ortak util, bkz. utils/receiptGroup.ts).
  const groupNo = documentTypeCode === 'z_raporu' ? generateReceiptGroupNo() : null;

  const stamp = formatDate(new Date());
  const titles = files.map((_, i) =>
    files.length > 1 ? `${documentTypeName} ${stamp} (${i + 1})` : `${documentTypeName} ${stamp}`,
  );

  startBatchUpload({
    label: `${files.length} evrak yükleniyor (Tarama)`,
    files,
    titles,
    upload: async (file, onProgress, index) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentTypeId', String(documentTypeId));
      fd.append('taxpayerId', taxpayerId);
      fd.append('quick', 'true');
      fd.append('title', titles[index]);
      if (groupNo) fd.append('metadata', JSON.stringify({ receiptGroupNo: groupNo }));

      fd.append('source', 'mobile_scan');
      await api.post('/documents', fd, {
        onUploadProgress: (evt) => {
          if (evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
    },
  });
}
