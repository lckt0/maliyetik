import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth';
import { apiError, apiPost } from '../api/client';
import { AuthSide } from '../components/AuthSide';
import { useDocumentTitle } from '../hooks';

export function Login() {
  useDocumentTitle('Giriş');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const user = await login(email, password);
      navigate(homePathFor(user.role), { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Şifre sıfırlama talebi. Sunucu, e-posta kayıtlı olsa da olmasa da aynı yanıtı
   * döndürür (kullanıcı numaralandırmasına kapalı); arayüz de aynı mesajı gösterir.
   */
  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiPost('/auth/forgot-password', { email });
      setForgotSent(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (forgotOpen) {
    return (
      <div className="auth-layout">
        <AuthSide
          title="Şifrenizi mi unuttunuz?"
          copy="E-posta adresinizi girin, şifrenizi sıfırlamanız için size bir bağlantı gönderelim."
        />
        <div className="auth-form-side">
          <form className="card login-card" onSubmit={requestReset}>
            <div className="brand">Maliyetik</div>
            <div className="sub">Şifre Sıfırlama</div>
            {error && <div className="alert error">{error}</div>}
            {forgotSent ? (
              <>
                <div className="alert success">
                  Bu e-posta adresi sistemde kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.
                  Gelen kutunuzu (ve spam klasörünü) kontrol edin.
                </div>
                <button type="button" className="btn" style={{ width: '100%' }}
                  onClick={() => { setForgotOpen(false); setForgotSent(false); }}>
                  Girişe Dön
                </button>
              </>
            ) : (
              <>
                <div className="field">
                  <label>E-posta</label>
                  <input type="email" value={email} autoFocus required
                    onChange={(e) => setEmail(e.target.value)} placeholder="ornek@firma.com" />
                </div>
                <button className="btn" style={{ width: '100%' }} disabled={busy}>
                  {busy ? 'Gönderiliyor…' : 'Sıfırlama Bağlantısı Gönder'}
                </button>
                <div className="auth-footer-link">
                  <button type="button" className="link-btn" onClick={() => setForgotOpen(false)}>
                    Girişe dön
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-layout">
      <AuthSide
        title="Mali evraklarınızı tek panelden yönetin"
        copy="Maliyetik, mükellefler ve mali müşavirler için modern, güvenli ve hızlı bir evrak yönetim sistemidir."
      />
      <div className="auth-form-side">
        <form className="card login-card" onSubmit={submit}>
          <div className="brand">Maliyetik</div>
          <div className="sub">Mali Evrak Yönetim Sistemi</div>
          {error && <div className="alert error">{error}</div>}
          <div className="field">
            <label>E-posta</label>
            <input type="email" value={email} autoFocus required
              onChange={(e) => setEmail(e.target.value)} placeholder="ornek@firma.com" />
          </div>
          <div className="field">
            <label>Parola</label>
            <input type="password" value={password} required
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
          <div className="auth-footer-link">
            <button type="button" className="link-btn" onClick={() => { setError(''); setForgotOpen(true); }}>
              Şifremi unuttum
            </button>
          </div>
          <div className="auth-footer-link">
            Hesabınız yok mu? <Link to="/kayit">Kayıt Ol</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
