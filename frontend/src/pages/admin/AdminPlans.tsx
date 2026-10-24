import { useEffect, useState } from 'react';
import { apiError, apiGet, apiPatch, apiPost } from '../../api/client';
import { useDebouncedValue } from '../../hooks';
import { Spinner } from '../../components/Spinner';
import { SearchIcon, WalletIcon } from '../../components/Icons';
import { AdminUserRow, Paginated, SubscriptionPlan } from '../../types';

const AUDIENCE_LABELS: Record<string, string> = { taxpayer: 'Mükellef', accountant: 'Mali Müşavir' };

type PlanDraft = Pick<SubscriptionPlan,
  'name' | 'description' | 'priceYearly' | 'includedQuota' | 'includedAiCredits'
  | 'maxTaxpayers' | 'trialDays' | 'isActive' | 'isPublic' | 'sortOrder'>;

function toDraft(p: SubscriptionPlan): PlanDraft {
  return {
    name: p.name, description: p.description ?? '', priceYearly: p.priceYearly,
    includedQuota: p.includedQuota, includedAiCredits: p.includedAiCredits, maxTaxpayers: p.maxTaxpayers,
    trialDays: p.trialDays, isActive: p.isActive, isPublic: p.isPublic, sortOrder: p.sortOrder,
  };
}

/**
 * Admin > Abonelik Planları — plan fiyat/içerik düzenleme ve bir kullanıcıya elle plan
 * atama. Sanal POS entegrasyonu gelene kadar abonelik başlatmanın TEK yolu buradaki
 * "Plan Ata" akışıdır; plan atandığında plana dahil kota ve AI kredisi de yüklenir.
 *
 * Plan `code` ve `audience` bilinçli olarak düzenlenemez: ödeme sağlayıcısındaki ürün
 * eşlemesi koda dayanacak, kitle değişimi ise satılmış aboneliklerin anlamını bozar.
 */
export function AdminPlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, PlanDraft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [picked, setPicked] = useState<AdminUserRow | null>(null);
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignTrial, setAssignTrial] = useState(false);
  const [assigning, setAssigning] = useState(false);

  async function load() {
    try {
      const rows = await apiGet<SubscriptionPlan[]>('/admin/billing/plans');
      setPlans(rows);
      setDrafts(Object.fromEntries(rows.map((p) => [p.id, toDraft(p)])));
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
      setPlans([]);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (picked || !debounced.trim()) { setUsers([]); return; }
    apiGet<Paginated<AdminUserRow>>('/admin/users', { search: debounced, limit: 10, page: 1 })
      .then((r) => setUsers(r.items.filter((u) => u.role !== 'admin')))
      .catch(() => setUsers([]));
  }, [debounced, picked]);

  function patchDraft(id: number, patch: Partial<PlanDraft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function save(plan: SubscriptionPlan) {
    const d = drafts[plan.id];
    setSavingId(plan.id);
    setMsg(null);
    try {
      await apiPatch(`/admin/billing/plans/${plan.id}`, {
        name: d.name,
        description: d.description || undefined,
        priceYearly: d.priceYearly,
        includedQuota: Number(d.includedQuota),
        includedAiCredits: Number(d.includedAiCredits),
        maxTaxpayers: Number(d.maxTaxpayers),
        trialDays: Number(d.trialDays),
        isActive: !!d.isActive,
        isPublic: !!d.isPublic,
        sortOrder: Number(d.sortOrder),
      });
      setMsg({ kind: 'success', text: `${d.name} güncellendi.` });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
    } finally {
      setSavingId(null);
    }
  }

  async function assign() {
    if (!picked || !assignPlanId) return;
    setAssigning(true);
    setMsg(null);
    try {
      await apiPost('/admin/billing/assign', {
        userId: picked.id, planId: Number(assignPlanId), trial: assignTrial,
      });
      setMsg({ kind: 'success', text: `${picked.fullName} için plan tanımlandı.` });
      setPicked(null);
      setSearch('');
      setAssignPlanId('');
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
    } finally {
      setAssigning(false);
    }
  }

  // Atanabilecek planlar kullanıcının rolüne göre daraltılır — sunucu da aynı kuralı uygular.
  const assignablePlans = (plans ?? []).filter(
    (p) => !picked || p.audience === (picked.role === 'accountant' ? 'accountant' : 'taxpayer'),
  );

  return (
    <>
      <div className="section-head"><h2><WalletIcon /> Abonelik Planları</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Fiyatları ve plan içeriklerini buradan düzenleyin. Tüm planlar <b>yıllıktır</b> ve fiyatlar
        KDV hariçtir. Sanal POS bağlanana kadar abonelik yalnızca aşağıdaki <b>Plan Ata</b>
        bölümünden elle tanımlanabilir.
      </p>

      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="card">
        <h3>Kullanıcıya Plan Ata</h3>
        {picked ? (
          <>
            <p>
              <b>{picked.fullName}</b> <span className="muted">({picked.email})</span>{' '}
              <span className="badge">{AUDIENCE_LABELS[picked.role] ?? picked.role}</span>{' '}
              <button type="button" className="btn sm secondary" onClick={() => setPicked(null)}>Değiştir</button>
            </p>
            <div className="grid cols-3">
              <div className="field">
                <label>Plan</label>
                <select value={assignPlanId} onChange={(e) => setAssignPlanId(e.target.value)}>
                  <option value="">Seçin…</option>
                  {assignablePlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>&nbsp;</label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={assignTrial} onChange={(e) => setAssignTrial(e.target.checked)} />
                  Deneme süresi olarak başlat
                </label>
              </div>
            </div>
            <button type="button" className="btn" disabled={!assignPlanId || assigning} onClick={() => void assign()}>
              {assigning ? 'Tanımlanıyor…' : 'Planı Tanımla'}
            </button>
            <p className="hint">
              Plan tanımlandığında evrak tavanı plana göre <b>ayarlanır</b> (eklenmez — aynı planın
              yenilenmesi tavanı büyütmez) ve yıllık AI kredisi hesaba yüklenir.
            </p>
          </>
        ) : (
          <>
            <div className="field" style={{ maxWidth: 380 }}>
              <label htmlFor="plan-user-search"><SearchIcon /> Kullanıcı Ara</label>
              <input id="plan-user-search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Ad, e-posta, unvan veya VKN…" />
            </div>
            {users.length > 0 && (
              <ul className="widget-list">
                {users.map((u) => (
                  <li key={u.id}>
                    <button type="button" className="quota-search-result" onClick={() => setPicked(u)}>
                      <b>{u.fullName}</b>
                      <span className="muted"> — {u.email}</span>
                      <span className="hint"> ({AUDIENCE_LABELS[u.role] ?? u.role}
                        {u.companyTitle ? ` · ${u.companyTitle}` : ''})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {plans === null && <Spinner label="Planlar yükleniyor…" />}

      {plans?.map((p) => {
        const d = drafts[p.id];
        if (!d) return null;
        return (
          <div className="card" key={p.id}>
            <h3 style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
              {p.name} <span className="badge">{AUDIENCE_LABELS[p.audience]}</span>{' '}
              <span className="muted" style={{ fontSize: '.8rem', fontWeight: 400 }}>{p.code}</span>
            </h3>
            <div className="grid cols-3">
              <div className="field">
                <label>Ad</label>
                <input value={d.name} onChange={(e) => patchDraft(p.id, { name: e.target.value })} />
              </div>
              <div className="field">
                <label>Açıklama</label>
                <input value={d.description ?? ''} onChange={(e) => patchDraft(p.id, { description: e.target.value })} />
              </div>
              <div className="field">
                <label>Sıra</label>
                <input type="number" value={d.sortOrder} onChange={(e) => patchDraft(p.id, { sortOrder: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>Yıllık Fiyat (₺, KDV hariç)</label>
                <input value={d.priceYearly} onChange={(e) => patchDraft(p.id, { priceYearly: e.target.value })} />
              </div>
              <div className="field">
                <label>Deneme (gün)</label>
                <input type="number" value={d.trialDays} onChange={(e) => patchDraft(p.id, { trialDays: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>Evrak Tavanı {p.audience === 'accountant' && <span className="muted">(müşavirde kullanılmaz)</span>}</label>
                <input type="number" value={d.includedQuota} disabled={p.audience === 'accountant'}
                  onChange={(e) => patchDraft(p.id, { includedQuota: e.target.value })} />
              </div>
              <div className="field">
                <label>Dahil AI Kredisi</label>
                <input type="number" value={d.includedAiCredits} onChange={(e) => patchDraft(p.id, { includedAiCredits: e.target.value })} />
              </div>
              <div className="field">
                <label>Mükellef Sınırı (0 = sınırsız)</label>
                <input type="number" value={d.maxTaxpayers} onChange={(e) => patchDraft(p.id, { maxTaxpayers: Number(e.target.value) })}
                  disabled={p.audience !== 'accountant'} />
              </div>
            </div>
            <div className="wizard-actions">
              <label className="checkbox-field">
                <input type="checkbox" checked={!!d.isActive} onChange={(e) => patchDraft(p.id, { isActive: e.target.checked ? 1 : 0 })} />
                Aktif
              </label>
              <label className="checkbox-field">
                <input type="checkbox" checked={!!d.isPublic} onChange={(e) => patchDraft(p.id, { isPublic: e.target.checked ? 1 : 0 })} />
                Fiyat listesinde göster
              </label>
              <button type="button" className="btn" disabled={savingId === p.id} onClick={() => void save(p)}>
                {savingId === p.id ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
