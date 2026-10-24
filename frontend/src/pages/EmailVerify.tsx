import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiError } from '../api/client';
import { useAuth, homePathFor } from '../auth';
import { AuthSide } from '../components/AuthSide';
import { useDocumentTitle } from '../hooks';

type Outcome = 'checking' | 'activated' | 'pending-approval' | 'error';

export function EmailVerify() {
  useDocumentTitle('E-posta Doğrulama');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { verifyEmail } = useAuth();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<Outcome>('checking');
  const [error, setError] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) { setOutcome('error'); setError('Doğrulama bağlantısı eksik.'); return; }
    verifyEmail(token)
      .then((r) => {
        if (r.activated) {
          setOutcome('activated');
          setTimeout(() => navigate(r.role ? homePathFor(r.role) : '/', { replace: true }), 1200);
        } else {
          setOutcome('pending-approval');
        }
      })
      .catch((err) => { setOutcome('error'); setError(apiError(err)); });
    // eslint-disable-next-line
  }, [token]);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/auth/resend-verification', { email: resendEmail });
      setResendSent(true);
    } catch {
      setResendSent(true); // enumeration'ı önlemek için yine genel bir başarı mesajı gösterilir
    }
  }

  return (
    <div className="auth-layout">
      <AuthSide title="Hesabınızı doğrulayın" copy="Neredeyse hazırsınız — tek adım kaldı." />
      <div className="auth-form-side">
        <div className="card login-card" style={{ textAlign: 'center' }}>
          <div className="brand">Maliyetik</div>

          {outcome === 'checking' && <p className="muted" style={{ marginTop: '1.5rem' }}>Doğrulanıyor…</p>}

          {outcome === 'activated' && (
            <div className="alert success" style={{ marginTop: '1.5rem' }}>
              E-postanız doğrulandı, hesabınız aktifleştirildi. Panele yönlendiriliyorsunuz…
            </div>
          )}

          {outcome === 'pending-approval' && (
            <div className="alert warning" style={{ marginTop: '1.5rem' }}>
              E-postanız doğrulandı. Hesabınız şu anda yönetici onayını bekliyor; onaylandığında giriş yapabileceksiniz.
            </div>
          )}

          {outcome === 'error' && (
            <>
              <div className="alert error" style={{ marginTop: '1.5rem' }}>{error || 'Doğrulama başarısız oldu.'}</div>
              {!resendSent ? (
                <form onSubmit={resend} style={{ marginTop: '1rem', textAlign: 'left' }}>
                  <div className="field">
                    <label>Bağlantı süresi dolduysa e-postanızı girin, tekrar gönderelim</label>
                    <input type="email" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} required />
                  </div>
                  <button className="btn" style={{ width: '100%' }}>Tekrar Gönder</button>
                </form>
              ) : (
                <p className="muted" style={{ marginTop: '1rem' }}>
                  E-posta adresiniz kayıtlıysa, yeni bir doğrulama bağlantısı gönderildi.
                </p>
              )}
            </>
          )}

          <div className="auth-footer-link">
            <Link to="/login">Giriş sayfasına dön</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
