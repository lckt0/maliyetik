import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, apiError } from '../api/client';
import { AuthSide } from '../components/AuthSide';
import { useDocumentTitle } from '../hooks';

export function ResetPassword() {
  useDocumentTitle('Şifre Sıfırlama');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('Şifreler eşleşmiyor.');
    setError(''); setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <AuthSide title="Şifrenizi sıfırlayın" copy="Yeni şifrenizi belirleyin, hemen giriş yapabilirsiniz." />
      <div className="auth-form-side">
        <div className="card login-card" style={{ textAlign: 'center' }}>
          <div className="brand">Maliyetik</div>

          {!token && (
            <div className="alert error" style={{ marginTop: '1.5rem' }}>Şifre sıfırlama bağlantısı eksik.</div>
          )}

          {token && done && (
            <div className="alert success" style={{ marginTop: '1.5rem' }}>
              Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.
            </div>
          )}

          {token && !done && (
            <form onSubmit={submit} style={{ marginTop: '1.5rem', textAlign: 'left' }}>
              {error && <div className="alert error">{error}</div>}
              <div className="field">
                <label>Yeni Şifre</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" />
              </div>
              <div className="field">
                <label>Yeni Şifre (Tekrar)</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" />
              </div>
              <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Şifreyi Güncelle'}</button>
            </form>
          )}

          <div className="auth-footer-link">
            <Link to="/login">Giriş sayfasına dön</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
