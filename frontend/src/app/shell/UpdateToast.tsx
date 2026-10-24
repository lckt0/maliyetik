import { useEffect, useState } from 'react';
import { setupPwa } from '../pwa';
import { XIcon } from '../../components/Icons';

/**
 * "Güncelleme hazır" çubuğu. Service worker yeni sürümü indirdiğinde görünür; kullanıcı
 * onaylayana kadar uygulama eski sürümde çalışmaya devam eder (bkz. pwa.ts — belge tarama
 * ortasında altından değişmemesi için `registerType: 'prompt'`).
 */
export function UpdateToast() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Fonksiyon state'i doğrudan set edilirse React onu güncelleyici sanır → sarmalanır.
    setupPwa((applyUpdate) => setApply(() => applyUpdate));
  }, []);

  if (!apply || dismissed) return null;

  return (
    <div className="m-toast" role="status">
      <span>Yeni sürüm hazır.</span>
      <button type="button" onClick={apply}>Yenile</button>
      <button type="button" className="dismiss" aria-label="Kapat" onClick={() => setDismissed(true)}>
        <XIcon width={18} height={18} />
      </button>
    </div>
  );
}
