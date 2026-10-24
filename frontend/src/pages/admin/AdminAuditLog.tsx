import { useEffect, useState } from 'react';
import { apiError, apiGet } from '../../api/client';
import { ClockIcon } from '../../components/Icons';
import { Pagination } from '../../components/Pagination';
import { AuditLogEntry, Paginated } from '../../types';
import { formatDateTime } from '../../utils/date';

const ACTION_LABELS: Record<string, string> = {
  uploaded: 'Evrak Yüklendi',
  updated: 'Evrak Düzenlendi',
  deleted: 'Evrak Silindi',
  restored: 'Evrak Geri Yüklendi',
  purged: 'Evrak Kalıcı Silindi',
  digitized: 'Evrak Dijitalleştirildi',
  'admin.user_role_changed': 'Kullanıcı Rolü Değiştirildi',
  'admin.user_status_changed': 'Kullanıcı Durumu Değiştirildi',
  'admin.user_approved': 'Kullanıcı Onaylandı',
  'admin.user_rejected': 'Kullanıcı Reddedildi',
  'admin.user_removed': 'Kullanıcı Silindi',
  'admin.user_impersonated': 'Kullanıcı Hesabına Geçildi',
  'admin.user_password_changed': 'Kullanıcı Şifresi Değiştirildi',
  'admin.user_password_reset_link_created': 'Şifre Sıfırlama Bağlantısı Oluşturuldu',
  'admin.announcement_created': 'Duyuru Oluşturuldu',
  'admin.announcement_updated': 'Duyuru Düzenlendi',
  'admin.announcement_deleted': 'Duyuru Silindi',
  'admin.quota_granted': 'Kota Tahsis Edildi',
  'admin.settings_updated': 'Sistem Ayarı Güncellendi',
  'admin.infra_cost_created': 'Maliyet Kaydı Eklendi',
  'admin.infra_cost_updated': 'Maliyet Kaydı Düzenlendi',
  'admin.infra_cost_deleted': 'Maliyet Kaydı Silindi',
  'admin.payment_reconciled': 'Ödeme Elle Mutabakat Edildi',
  'admin.payment_marked_failed': 'Ödeme Başarısız İşaretlendi',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  document: 'Evrak',
  user: 'Kullanıcı',
  announcement: 'Duyuru',
  taxpayer_profile: 'Mükellef',
  system_setting: 'Sistem Ayarı',
  infra_cost: 'Maliyet Kaydı',
  payment: 'Ödeme',
};

function describeEntry(e: AuditLogEntry): string {
  if (e.metadata?.documentTitle) return String(e.metadata.documentTitle);
  if (e.entityType && e.entityId) return `${ENTITY_TYPE_LABELS[e.entityType] ?? e.entityType} #${e.entityId}`;
  return '—';
}

export function AdminAuditLog() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(p: number) {
    setLoading(true); setError('');
    try {
      const params: Record<string, string | number> = { limit: 30, page: p };
      if (action) params.action = action;
      if (entityType) params.entityType = entityType;
      const data = await apiGet<Paginated<AuditLogEntry>>('/admin/audit-logs', params);
      setRows(data.items);
      setTotalPages(data.totalPages ?? 1);
      setPage(p);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, entityType]);

  return (
    <>
      <div className="section-head"><h2><ClockIcon /> Denetim Günlüğü</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Sistemdeki tüm kritik işlemler — evrak hareketleri, kullanıcı yönetimi, kota tahsisi, duyurular ve
        sistem ayarı değişiklikleri — işlemi yapan kullanıcıyla birlikte burada listelenir.
      </p>

      <div className="toolbar">
        <div className="field">
          <label>İşlem Türü</label>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tümü</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Varlık Türü</label>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">Tümü</option>
            {Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-wrap fixed-h">
        <table className="compact">
          <thead><tr><th>Tarih</th><th>İşlem</th><th>Varlık</th><th>Kullanıcı</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="muted">Yükleniyor…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="muted">Kayıt yok.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.createdAt)}</td>
                <td><span className="badge active">{ACTION_LABELS[r.action] ?? r.action}</span></td>
                <td>{describeEntry(r)}</td>
                <td>{r.actorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={load} disabled={loading} />
    </>
  );
}
