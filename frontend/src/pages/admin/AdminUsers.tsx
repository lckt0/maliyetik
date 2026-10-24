import { useEffect, useState } from 'react';
import { apiDelete, apiError, apiGet, apiPatch, apiPost } from '../../api/client';
import { AdminUserRow, AuthUser, Paginated, Role, UserStatus } from '../../types';
import { relativeTime } from '../../utils/time';
import { UserEditModal } from '../../components/UserEditModal';
import { UserRoleModal } from '../../components/UserRoleModal';
import { UserPasswordModal } from '../../components/UserPasswordModal';
import { UserPasswordResetLinkModal } from '../../components/UserPasswordResetLinkModal';
import { stashAdminSessionAndSwitchTo } from '../../components/ImpersonationBanner';
import { useDialog } from '../../components/DialogProvider';
import { KeyIcon, LinkIcon, PauseIcon, PencilIcon, PlayIcon, SwitchUserIcon, TrashIcon, UsersIcon } from '../../components/Icons';
import { Pagination } from '../../components/Pagination';

const ROLE_LABEL: Record<Role, string> = { taxpayer: 'Mükellef', accountant: 'Mali Müşavir', admin: 'Admin' };
const STATUS_LABEL: Record<UserStatus, string> = { active: 'Aktif', suspended: 'Pasif', pending: 'Onay Bekliyor' };
const STATUS_BADGE: Record<UserStatus, string> = { active: 'active', suspended: 'revoked', pending: 'pending' };

export function AdminUsers() {
  const { confirm } = useDialog();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [awaitingApproval, setAwaitingApproval] = useState(false);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [roleUser, setRoleUser] = useState<AdminUserRow | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUserRow | null>(null);
  const [resetLinkUser, setResetLinkUser] = useState<AdminUserRow | null>(null);

  async function load(p: number) {
    setLoading(true); setError('');
    try {
      const params: Record<string, string | number> = { limit: 25, page: p };
      if (role) params.role = role;
      if (status) params.status = status;
      if (search) params.search = search;
      if (awaitingApproval) params.awaitingApproval = 'true';
      const data = await apiGet<Paginated<AdminUserRow>>('/admin/users', params);
      setRows(data.items);
      setTotalPages(data.totalPages ?? 1);
      setPage(p);
      setSelected(new Set());
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line
  }, [role, status, search, awaitingApproval]);

  function reload() { load(page); }

  async function toggleStatus(u: AdminUserRow) {
    const next = u.status === 'active' ? 'suspended' : 'active';
    const ok = await confirm(
      next === 'suspended' ? `${u.fullName} devre dışı bırakılsın mı?` : `${u.fullName} tekrar aktif edilsin mi?`,
      next === 'suspended' ? { danger: true, confirmLabel: 'Pasifleştir' } : { confirmLabel: 'Aktifleştir' },
    );
    if (!ok) return;
    try {
      await apiPatch(`/admin/users/${u.id}/status`, { status: next });
      setMsg(next === 'suspended' ? `${u.fullName} devre dışı bırakıldı.` : `${u.fullName} aktif edildi.`);
      reload();
    } catch (e) { setError(apiError(e)); }
  }

  async function remove(u: AdminUserRow) {
    if (!await confirm(`${u.fullName} silinsin mi? Bu işlem geri alınamaz.`, { danger: true, confirmLabel: 'Sil' })) return;
    try {
      await apiDelete(`/admin/users/${u.id}`);
      setMsg('Kullanıcı silindi.');
      reload();
    } catch (e) { setError(apiError(e)); }
  }

  async function approve(u: AdminUserRow) {
    try {
      await apiPost(`/admin/users/${u.id}/approve`);
      setMsg(`${u.fullName} onaylandı.`);
      reload();
    } catch (e) { setError(apiError(e)); }
  }

  async function impersonate(u: AdminUserRow) {
    const ok = await confirm(
      `${u.fullName} hesabına geçiş yapılsın mı? Yönetici oturumunuz saklanacak, istediğiniz zaman geri dönebilirsiniz.`,
      { confirmLabel: 'Hesabına Geç' },
    );
    if (!ok) return;
    try {
      const res = await apiPost<{ accessToken: string; refreshToken: string; user: AuthUser }>(`/admin/users/${u.id}/impersonate`);
      stashAdminSessionAndSwitchTo(res, res.user);
    } catch (e) { setError(apiError(e)); }
  }

  async function reject(u: AdminUserRow) {
    if (!await confirm(`${u.fullName} reddedilsin mi? Hesap silinecek.`, { danger: true, confirmLabel: 'Reddet' })) return;
    try {
      await apiPost(`/admin/users/${u.id}/reject`);
      setMsg(`${u.fullName} reddedildi.`);
      reload();
    } catch (e) { setError(apiError(e)); }
  }

  async function approveBulk() {
    if (selected.size === 0) return;
    try {
      await apiPost('/admin/users/approve-bulk', { ids: [...selected] });
      setMsg(`${selected.size} kullanıcı onaylandı.`);
      reload();
    } catch (e) { setError(apiError(e)); }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="section-head">
        <h2><UsersIcon /> Kullanıcılar</h2>
      </div>

      <div className="toolbar">
        <div className="field">
          <label>Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Tümü</option>
            <option value="taxpayer">Mükellef</option>
            <option value="accountant">Mali Müşavir</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="field">
          <label>Durum</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tümü</option>
            <option value="active">Aktif</option>
            <option value="suspended">Pasif</option>
            <option value="pending">Onay Bekliyor</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>Ara</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad veya e-posta…" />
        </div>
        <button
          type="button"
          className={`btn ${awaitingApproval ? '' : 'secondary'}`}
          onClick={() => setAwaitingApproval((v) => !v)}
        >
          Onay Bekleyenler
        </button>
      </div>

      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      {awaitingApproval && selected.size > 0 && (
        <div className="toolbar">
          <button type="button" className="btn" onClick={approveBulk}>Seçilenleri Onayla ({selected.size})</button>
        </div>
      )}

      <div className="table-wrap fixed-h">
        <table className="compact">
          <thead>
            <tr>
              {awaitingApproval && <th></th>}
              <th>Ad Soyad</th>
              <th>E-posta</th>
              <th>Rol</th>
              <th>Firma / Unvan</th>
              <th>Durum</th>
              <th>E-posta Doğrulandı</th>
              <th>Kayıt</th>
              <th>Aksiyonlar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                {awaitingApproval && (
                  <td><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} /></td>
                )}
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{u.companyTitle || u.displayTitle || '—'}</td>
                <td><span className={`badge ${STATUS_BADGE[u.status]}`}>{STATUS_LABEL[u.status]}</span></td>
                <td>{u.emailVerifiedAt ? 'Evet' : 'Hayır'}</td>
                <td>{relativeTime(u.createdAt)}</td>
                <td>
                  <div className="row-actions">
                    {awaitingApproval ? (
                      <>
                        <button type="button" className="btn sm" onClick={() => approve(u)}>Onayla</button>
                        <button type="button" className="btn sm secondary" onClick={() => reject(u)}>Reddet</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="icon-btn sm" title="Düzenle" onClick={() => setEditUser(u)}><PencilIcon /></button>
                        <button type="button" className="icon-btn sm" title="Rol Değiştir" onClick={() => setRoleUser(u)}><UsersIcon /></button>
                        <button type="button" className="icon-btn sm" title="Şifre Değiştir" onClick={() => setPasswordUser(u)}><KeyIcon /></button>
                        <button type="button" className="icon-btn sm" title="Şifre Sıfırlama Bağlantısı Oluştur" onClick={() => setResetLinkUser(u)}><LinkIcon /></button>
                        {u.role !== 'admin' && (
                          <button type="button" className="icon-btn sm" title="Hesabına Geç" onClick={() => impersonate(u)}><SwitchUserIcon /></button>
                        )}
                        <button
                          type="button"
                          className="icon-btn sm"
                          title={u.status === 'active' ? 'Pasifleştir' : 'Aktifleştir'}
                          onClick={() => toggleStatus(u)}
                        >
                          {u.status === 'active' ? <PauseIcon /> : <PlayIcon />}
                        </button>
                        <button type="button" className="icon-btn sm danger" title="Sil" onClick={() => remove(u)}><TrashIcon /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="muted">Kayıt bulunamadı.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={load} disabled={loading} />

      {editUser && <UserEditModal user={editUser} onClose={() => setEditUser(null)} onSaved={reload} />}
      {roleUser && <UserRoleModal user={roleUser} onClose={() => setRoleUser(null)} onSaved={reload} />}
      {passwordUser && (
        <UserPasswordModal
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          onSaved={() => setMsg(`${passwordUser.fullName} için şifre değiştirildi.`)}
        />
      )}
      {resetLinkUser && <UserPasswordResetLinkModal user={resetLinkUser} onClose={() => setResetLinkUser(null)} />}
    </>
  );
}
