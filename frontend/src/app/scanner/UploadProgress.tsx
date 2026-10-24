import { useUploadJob } from '../../uploadManager';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Bekliyor',
  uploading: 'Yükleniyor…',
  done: 'Kaydedildi',
};

/**
 * Aktif toplu yükleme işinin durumu. `uploadManager` modül düzeyinde çalıştığı için
 * kullanıcı taramadan çıkıp başka sekmeye geçse bile yükleme sürer ve bu bileşen
 * nereye monte edilirse edilsin aynı işi gösterir.
 */
export function UploadProgress() {
  const job = useUploadJob();
  if (!job) return null;

  const running = job.status === 'running';

  return (
    <div className="m-card" style={{ marginTop: '1rem' }}>
      <h3>{running ? job.label : job.failed ? 'Yükleme tamamlandı (hatalarla)' : 'Yükleme tamamlandı'}</h3>

      {running && (
        <>
          <div className="m-progress"><div className="m-progress-fill" style={{ width: `${job.percent}%` }} /></div>
          <p className="m-hint" style={{ margin: '.5rem 0 .75rem' }}>
            %{job.percent} · Yükleme arka planda sürer, uygulamada gezinebilirsiniz.
          </p>
        </>
      )}

      {!running && (
        <p className="m-hint" style={{ margin: '0 0 .75rem' }}>
          {job.completed - job.failed} evrak kaydedildi
          {job.failed > 0 && `, ${job.failed} evrak kaydedilemedi`}.
          {job.failed < job.completed && ' Alanlarını web panelindeki Evrak Dijitalleştir sayfasından tamamlayabilirsiniz.'}
        </p>
      )}

      <div>
        {job.files.map((f, i) => (
          <div key={i} className={`m-upload-row ${f.status}`}>
            <span className="name">{f.title || f.name}</span>
            {/* Hata mesajı backend'in gerçek nedenini taşır (kota doldu, bu dosya zaten
                yüklenmiş vb.) — genel "tekrar deneyin" metniyle değiştirilmez. */}
            <span className="status">{f.status === 'error' ? (f.error || 'Hata') : STATUS_LABEL[f.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
