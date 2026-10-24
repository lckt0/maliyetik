import { ReactNode, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { useAuth } from '../../auth';
import { useDocumentTitle } from '../../hooks';
import { Authorization } from '../../types';
import { BuildingIcon, ChevronDownIcon, FolderIcon, UploadIcon, UserIcon } from '../../components/Icons';
import { ArrowLeftIcon } from '../icons';
import { getActiveTaxpayerTitle, setActiveTaxpayerTitle } from '../taxpayerContext';
import { TaxpayerPicker } from './TaxpayerPicker';

interface Tab { to: string; label: string; icon: ReactNode; }

/**
 * Alt sekme çubuğu. Evrak Yükle bilinçli olarak ilk sırada: uygulamanın varlık sebebi
 * belge taramak, en sık kullanılan eylem en erişilebilir yerde durmalı.
 */
const TABS: Tab[] = [
  { to: '/yukle', label: 'Evrak Yükle', icon: <UploadIcon /> },
  { to: '/evraklar', label: 'Evraklar', icon: <FolderIcon /> },
  { to: '/sirket', label: 'Şirket', icon: <BuildingIcon /> },
  { to: '/profil', label: 'Profil', icon: <UserIcon /> },
];

export function MobileShell() {
  return (
    <div className="m-app">
      <Outlet />
      <nav className="m-tabbar">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to}
            className={({ isActive }) => `m-tab ${isActive ? 'active' : ''}`}>
            {t.icon}
            <span className="m-tab-label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/**
 * Aktif mükellef çubuğu — yalnızca mali müşavir ve admin için.
 *
 * Mükellef rolünde bağlam her zaman kendisidir, bu yüzden hiç gösterilmez ve ekranda
 * yer kaplamaz. Müşavir/admin ise hangi mükellef adına işlem yaptığını her sayfada
 * görebilmeli: mobilde yanlış mükellefe evrak yüklemek kotayı ve muhasebeyi bozar.
 */
export function TaxpayerContextBar() {
  const { user, activeTaxpayerId } = useAuth();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string | null>(getActiveTaxpayerTitle);

  const needsContext = user?.role === 'accountant' || user?.role === 'admin';

  // Ad normalde seçim anında saklanıyor (bkz. taxpayerContext.ts). Bu etki yalnızca
  // saklanmamış bir seçim varsa (ör. bu özellikten önce açılmış bir oturum) devreye
  // girer; müşavirin listesi küçük olduğu için oradan çözülür, adminde ise arama
  // sayfalandığı için ad genel bir etikete düşer.
  useEffect(() => {
    if (!needsContext || !activeTaxpayerId) { setLabel(null); return; }
    const stored = getActiveTaxpayerTitle();
    if (stored) { setLabel(stored); return; }
    if (user?.role !== 'accountant') return;

    let cancelled = false;
    apiGet<Authorization[]>('/authorizations/my-taxpayers')
      .then((rows) => {
        if (cancelled) return;
        const title = rows.find((a) => a.taxpayerId === activeTaxpayerId)?.taxpayer?.companyTitle ?? null;
        if (title) { setLabel(title); setActiveTaxpayerTitle(title); }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [needsContext, activeTaxpayerId, user?.role]);

  if (!needsContext) return null;

  return (
    <>
      <button type="button" className="m-context-bar" onClick={() => setOpen(true)}>
        <BuildingIcon width={16} height={16} />
        <span className="m-context-name">
          {label ?? (activeTaxpayerId ? 'Mükellef' : 'Mükellef seçin')}
        </span>
        <ChevronDownIcon width={16} height={16} />
      </button>
      {open && <TaxpayerPicker onClose={() => setOpen(false)} />}
    </>
  );
}

interface PageProps {
  title: string;
  /** Geri düğmesi gösterilir; verilmezse tarayıcı geçmişinde bir adım geri gidilir. */
  back?: string | true;
  action?: ReactNode;
  children: ReactNode;
}

/** Sayfa iskeleti — üst çubuk + kaydırılabilir içerik. Sekme çubuğu MobileShell'de. */
export function MobilePage({ title, back, action, children }: PageProps) {
  const navigate = useNavigate();
  const { user, activeTaxpayerId } = useAuth();
  // Masaüstüyle aynı kural: mükellef adı yalnızca başkasının mükellefiyle çalışan
  // rollerde (müşavir/admin) başlığa girer.
  const needsContext = user?.role === 'accountant' || user?.role === 'admin';
  useDocumentTitle(needsContext && activeTaxpayerId ? getActiveTaxpayerTitle() : null, title);

  return (
    <>
      <header className="m-appbar">
        {back && (
          <button type="button" className="m-appbar-btn" aria-label="Geri"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}>
            <ArrowLeftIcon width={22} height={22} />
          </button>
        )}
        <h1 className="m-appbar-title">{title}</h1>
        {action}
      </header>
      <TaxpayerContextBar />
      <main className="m-content">{children}</main>
    </>
  );
}
