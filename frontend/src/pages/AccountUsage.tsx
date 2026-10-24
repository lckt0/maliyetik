import { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { GaugeIcon, SparkleIcon, WalletIcon } from '../components/Icons';
import { AiKredi } from './mukellef/AiKredi';
import { Kota } from './mukellef/Kota';
import { Subscription } from './Subscription';

type Tab = 'abonelik' | 'kota' | 'ai';

const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'abonelik', label: 'Abonelik', icon: <WalletIcon /> },
  { key: 'kota', label: 'Evrak Kotası', icon: <GaugeIcon /> },
  { key: 'ai', label: 'AI Kredisi', icon: <SparkleIcon /> },
];

/**
 * Hesap & Kullanım — abonelik, evrak kotası ve AI kredisi TEK sayfada. Üçü de aynı soruyu yanıtlıyordu ("neyim var, ne kadarını harcadım") ama
 * menüde ayrı ayrı duruyordu; kota dolduğunda kullanıcı plan sayfasına, plan bakarken
 * kotaya gidip geliyordu. Eski adresler (/mukellef/kota, /mukellef/ai-kredi,
 * /musavir/ai-kredi) bu sayfanın ilgili sekmesine yönlendirilir (bkz. App.tsx).
 *
 * Sekme adreste taşınır (`?sekme=`) — bir sekmeye doğrudan bağlantı verilebilsin ve
 * geri tuşu sekmeler arasında çalışsın.
 *
 * MÜŞAVİRDE "Evrak Kotası" sekmesi yok: müşavirin kotası kendi hesabında değil, her
 * mükellefin kendi sekmesindeki "Mükellef Kota/Kredi" sayfasında yönetilir.
 */
export function AccountUsage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const tabs = user?.role === 'accountant' ? TABS.filter((t) => t.key !== 'kota') : TABS;
  const requested = params.get('sekme');
  const tab: Tab = tabs.find((t) => t.key === requested)?.key ?? 'abonelik';

  function select(key: Tab) {
    const next = new URLSearchParams(params);
    if (key === 'abonelik') next.delete('sekme');
    else next.set('sekme', key);
    setParams(next, { replace: true });
  }

  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button type="button" key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => select(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'abonelik' && <Subscription />}
      {tab === 'kota' && <Kota />}
      {tab === 'ai' && <AiKredi />}
    </>
  );
}
