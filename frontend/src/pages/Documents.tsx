import { useState } from 'react';
import { useAuth } from '../auth';
import { useDocumentTypes } from '../hooks';
import { DocumentFilters, DocumentsTable } from '../components/DocumentsTable';
import { AiSearchBar } from '../components/AiSearchBar';
import { PageIntro } from '../components/PageIntro';
import { FolderIcon, UploadIcon } from '../components/Icons';
import { AiSearchFilter } from '../ai';

export function Documents() {
  const types = useDocumentTypes();
  const { user } = useAuth();
  /** Doğal dille aramadan gelen filtre; `key` her aramada artar ki aynı filtre tekrar uygulanabilsin. */
  const [aiFilter, setAiFilter] = useState<(Partial<DocumentFilters> & { key: number }) | undefined>();

  /** AI filtresini tablonun anladığı biçime çevirir — tür kodu id'ye dönüştürülür. */
  function applyAiFilter(f: AiSearchFilter) {
    const typeId = f.documentTypeCode ? types.find((t) => t.code === f.documentTypeCode)?.id : undefined;
    setAiFilter({
      key: Date.now(),
      documentTypeId: typeId ? String(typeId) : '',
      dateFrom: f.dateFrom ?? '',
      dateTo: f.dateTo ?? '',
      direction: f.direction ?? '',
      q: f.q ?? '',
      amountMin: f.amountMin != null ? String(f.amountMin) : '',
      amountMax: f.amountMax != null ? String(f.amountMax) : '',
    });
  }
  const isTaxpayer = user?.role === 'taxpayer';
  const base = isTaxpayer ? '/mukellef' : '/musavir';

  return (
    <>
      <PageIntro
        icon={<FolderIcon />}
        title={isTaxpayer ? 'Evraklarım' : 'Evraklar'}
        action={{ to: `${base}/yukle`, label: 'Evrak Yükle', icon: <UploadIcon /> }}
      >
        {isTaxpayer
          ? 'Yüklediğiniz tüm evraklar burada. Türe, tarihe, belge numarasına ve tutara göre filtreleyebilir, evrağı açıp indirebilir veya bilgilerini düzenleyebilirsiniz.'
          : 'Seçili mükellefin tüm evrakları. Türe, tarihe, belge numarasına ve tutara göre filtreleyin; toplu seçip indirebilir, düzenleyebilir veya çöp kutusuna taşıyabilirsiniz.'}
      </PageIntro>

      {isTaxpayer && (
        <div className="alert warning">
          Evrakların sahipliği size aittir fakat ne yaptığınızdan emin değilseniz bir işlem yapmadan mali müşavirinize danışmayı unutmayın.
        </div>
      )}
      <AiSearchBar onFilter={applyAiFilter} />

      {/* Tablo kendi scroll'unda: 300+ evrakta sayfa metrelerce uzuyordu, filtre çubuğu
          ekrandan çıkıyordu. Yükseklik pencereye göre hesaplanıyor (bkz. .table-wrap.fixed-h). */}
      <DocumentsTable endpoint="/documents" documentTypes={types} externalFilter={aiFilter} />
    </>
  );
}
