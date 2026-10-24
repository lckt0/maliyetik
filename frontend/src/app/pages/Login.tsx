import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { apiError, apiErrorCode } from '../../api/client';
import { AlertCircleIcon, ShieldIcon } from '../../components/Icons';
import { SITE_HOST } from '../../site';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  /** Rol engeli, normal hatadan ayrı ve daha belirgin gösterilir. */
  const [blocked, setBlocked] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBlocked(''); setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/yukle', { replace: true });
    } catch (err) {
      // Mobil erişim admin panelinden rol bazında kapatılabiliyor
      // (AuthService.assertMobileAccess). Kapalıysa token hiç üretilmez; bu, hatalı
      // paroladan farklı bir durum olduğu için ayrı ve daha belirgin gösterilir.
      if (apiErrorCode(err) === 'MOBILE_ACCESS_DISABLED') setBlocked(apiError(err));
      else setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="m-auth" onSubmit={submit}>
      <div className="m-auth-logo" aria-hidden="true">M</div>
      <h1>Maliyetik</h1>
      <p className="m-auth-sub">Evraklarınızı tarayın, anında yükleyin.</p>

      {blocked && (
        <div className="m-alert warning" role="alert">
          <ShieldIcon width={18} height={18} />
          <span>{blocked}</span>
        </div>
      )}
      {error && (
        <div className="m-alert error" role="alert">
          <AlertCircleIcon width={18} height={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="m-field">
        <label htmlFor="m-email">E-posta</label>
        <input id="m-email" type="email" inputMode="email" autoComplete="username"
          autoCapitalize="none" autoCorrect="off" required value={email}
          placeholder="ornek@firma.com" onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="m-field">
        <label htmlFor="m-password">Parola</label>
        <input id="m-password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>

      <button className="m-btn" disabled={busy}>
        {busy ? <><span className="m-spinner" /> Giriş yapılıyor…</> : 'Giriş Yap'}
      </button>

      <p className="m-auth-foot">
        Mükellef, mali müşavir ve admin hesaplarıyla giriş yapabilirsiniz.<br />
        Tüm özellikler için <strong>{SITE_HOST}</strong> web panelini kullanın.
      </p>
    </form>
  );
}
