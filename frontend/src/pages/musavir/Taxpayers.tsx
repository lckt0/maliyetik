import { useState } from 'react';
import { api, apiError } from '../../api/client';
import { useAuth } from '../../auth';
import { useMyTaxpayers } from '../../taxpayers';
import { Authorization } from '../../types';
import { TaxpayerQuotaModal } from '../../components/TaxpayerQuotaModal';
import { BellIcon, ExternalWindowIcon, GaugeIcon } from '../../components/Icons';
import { NotifyTaxpayersModal } from '../../components/NotifyTaxpayersModal';
import { taxpayerColor } from '../../utils/taxpayerColor';
import { openTaxpayerTab, TAXPAYER_TAB_HOME } from '../../tabs';

export function MusavirTaxpayers() {
  const { activeTaxpayerId } = useAuth();
  // Ortak liste: burada bir talebi kabul etmek üst bardaki mükellef seçiciyi ve
  // müşavir anasayfasını da anında günceller (bkz. taxpayers.tsx).
  const { all, active, reload } = useMyTaxpayers();
  const [msg, setMsg] = useState('');
  const [quotaFor, setQuotaFor] = useState<Authorization | null>(null);
  const [notifyFor, setNotifyFor] = useState<string | null | undefined>(undefined);

  const pending = all.filter((a) => a.status === 'pending');

  async function accept(id: string) {
    setMsg('');
    try { await api.post(`/authorizations/${id}/accept`); reload(); }
    catch (e) { setMsg(apiError(e)); }
  }

  return (
    <>
      {msg && <div className="alert error">{msg}</div>}

      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>Bekleyen Yetki Talepleri</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mükellef</th><th>VKN/TCKN</th><th></th></tr></thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id}>
                    <td>{a.taxpayer?.companyTitle}</td>
                    <td>{a.taxpayer?.vknTckn}</td>
                    <td><button className="btn sm" onClick={() => accept(a.id)}>Kabul Et</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section-head"><h2>Mükelleflerim</h2></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mükellef</th><th>VKN/TCKN</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {active.length === 0 && <tr><td colSpan={4} className="muted">Henüz aktif mükellef yok.</td></tr>}
            {active.map((a) => {
              const isActive = a.taxpayerId === activeTaxpayerId;
              return (
                <tr key={a.id}>
                  <td>
                    <span className="tp-dot" style={{ background: taxpayerColor(a.taxpayerId) ?? undefined, marginRight: 6 }} aria-hidden="true" />
                    {a.taxpayer?.companyTitle}
                  </td>
                  <td>{a.taxpayer?.vknTckn}</td>
                  <td>{isActive ? <span className="badge active">seçili</span> : <span className="muted">—</span>}</td>
                  <td className="row-actions">
                    <button type="button" className="icon-btn" title="Kota / AI Kredi" onClick={() => setQuotaFor(a)}><GaugeIcon /></button>
                    <button type="button" className="icon-btn" title="Bildirim gönder" onClick={() => setNotifyFor(a.taxpayerId)}><BellIcon /></button>
                    {/* Tek eylem: mükellefi KENDİ sekmesinde aç. Sekmesi zaten açıksa
                        yenisi açılmaz, o sekmeye geçilir (bkz. tabs.tsx openTaxpayerTab).
                        Bulunulan sekmenin mükellefini yerinde değiştirme seçeneği bilerek
                        kaldırıldı: bu sayfa bir ofis sayfası, mükellefini değiştirmek
                        sekmeyi ofis sayfasını gösteren bir mükellef sekmesine çevirirdi. */}
                    <button className={`btn sm ${isActive ? 'secondary' : ''}`}
                      title={isActive ? 'Bu sekmenin mükellefi' : 'Kendi sekmesinde aç'}
                      onClick={() => openTaxpayerTab(a.taxpayerId, TAXPAYER_TAB_HOME, {
                        taxpayerTitle: a.taxpayer?.companyTitle ?? null,
                      })}>
                      <ExternalWindowIcon /> {isActive ? 'Sekmesine Git' : 'Sekmede Aç'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: '.75rem' }}>
        Her mükellef <b>kendi sekmesinde</b> açılır ve o sekme baştan sona o mükellefe bağlı
        kalır. Aynı anda birden fazla mükellefle çalışabilirsiniz; sekmeler arasında geçiş
        Alt+1…9 ile de yapılır.
      </p>

      {quotaFor && (
        <TaxpayerQuotaModal taxpayerId={quotaFor.taxpayerId} companyTitle={quotaFor.taxpayer?.companyTitle ?? ''}
          onClose={() => setQuotaFor(null)} />
      )}

      {notifyFor !== undefined && (
        <NotifyTaxpayersModal initialTaxpayerId={notifyFor} onClose={() => setNotifyFor(undefined)} />
      )}
    </>
  );
}
