import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError, apiGet } from '../api/client';
import { Role, SystemStatus } from '../types';
import { AuthSide } from '../components/AuthSide';
import { BuildingIcon, ChevronRightIcon, UserIcon } from '../components/Icons';
import { useDocumentTitle } from '../hooks';

type FormRole = Extract<Role, 'taxpayer' | 'accountant'>;

export function Register() {
  useDocumentTitle('Kayıt Ol');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [step, setStep] = useState<'choose' | 'form'>('choose');
  const [role, setRole] = useState<FormRole>('taxpayer');
  const [isSoleProprietor, setIsSoleProprietor] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyTitle, setCompanyTitle] = useState('');
  const [vknTckn, setVknTckn] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [city, setCity] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { apiGet<SystemStatus>('/system/status').then(setStatus).catch(() => {}); }, []);

  // Şahıs şirketi işaretliyken Firma Unvanı, Ad Soyad ile canlı senkron tutulur.
  useEffect(() => {
    if (isSoleProprietor) setCompanyTitle(fullName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSoleProprietor, fullName]);

  function chooseRole(r: FormRole) {
    setRole(r);
    setStep('form');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api.post('/auth/register', {
        role, email, password, fullName, phone: phone || undefined,
        acceptedTerms, marketingConsent,
        ...(role === 'taxpayer'
          ? { companyTitle, vknTckn, taxOffice: taxOffice || undefined }
          : { displayTitle, licenseNo: licenseNo || undefined, officeName: officeName || undefined, city: city || undefined }),
      });
      setDone(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const registrationClosed = status !== null && !status.registrationEnabled;

  return (
    <div className="auth-layout">
      <AuthSide
        title="Mükellef veya mali müşavir olarak katılın"
        copy="Kayıt olun, e-postanızı doğrulayın ve evrak yönetimine hemen başlayın."
      />
      <div className="auth-form-side">
        <div className="card login-card" style={{ maxWidth: 440 }}>
          <div className="brand">Maliyetik</div>
          <div className="sub">Yeni Hesap Oluştur</div>

          {done ? (
            <div className="alert success">
              Kaydınız alındı. <b>{email}</b> adresine gönderdiğimiz doğrulama bağlantısına tıklayarak
              hesabınızı etkinleştirebilirsiniz.
            </div>
          ) : registrationClosed ? (
            <div className="alert warning">Yeni kayıtlar şu anda kapalı. Lütfen daha sonra tekrar deneyin.</div>
          ) : step === 'choose' ? (
            <div className="register-role-cards">
              <button type="button" className="card register-role-card" onClick={() => chooseRole('taxpayer')}>
                <span className="register-role-icon"><BuildingIcon /></span>
                <div className="register-role-text">
                  <b>Mükellef</b>
                  <span className="muted">Firmanızın evraklarını yükleyin, mali müşavirinizle paylaşın.</span>
                </div>
                <ChevronRightIcon className="register-role-chevron" />
              </button>
              <button type="button" className="card register-role-card" onClick={() => chooseRole('accountant')}>
                <span className="register-role-icon"><UserIcon /></span>
                <div className="register-role-text">
                  <b>Mali Müşavir</b>
                  <span className="muted">Mükelleflerinizi tek panelden yönetin.</span>
                </div>
                <ChevronRightIcon className="register-role-chevron" />
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              {error && <div className="alert error">{error}</div>}
              <button type="button" className="register-back-link" onClick={() => setStep('choose')}>
                ← Farklı bir hesap türü seç
              </button>
              <div className="row">
                <div className="field">
                  <label>Ad Soyad <span className="req">*</span></label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={150} />
                </div>
                <div className="field">
                  <label>Telefon</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
                </div>
              </div>
              <div className="field">
                <label>E-posta <span className="req">*</span></label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label>Parola <span className="req">*</span></label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                <span className="hint">En az 8 karakter.</span>
              </div>

              {role === 'taxpayer' ? (
                <>
                  <div className="field">
                    <label>Firma Unvanı <span className="req">*</span></label>
                    <input
                      value={companyTitle}
                      onChange={(e) => setCompanyTitle(e.target.value)}
                      required
                      maxLength={255}
                      disabled={isSoleProprietor}
                    />
                  </div>
                  <div className="field">
                    <label className="checkbox-field">
                      <input type="checkbox" checked={isSoleProprietor} onChange={(e) => setIsSoleProprietor(e.target.checked)} />
                      Şahıs şirketi misiniz?
                    </label>
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>VKN/TCKN <span className="req">*</span></label>
                      <input value={vknTckn} onChange={(e) => setVknTckn(e.target.value)} required maxLength={11} />
                    </div>
                    <div className="field">
                      <label>Vergi Dairesi</label>
                      <input value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} maxLength={120} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <label>Unvan <span className="req">*</span></label>
                    <input value={displayTitle} onChange={(e) => setDisplayTitle(e.target.value)} required maxLength={255} placeholder="ör. Serbest Muhasebeci Mali Müşavir" />
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Ruhsat/Oda Sicil No</label>
                      <input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} maxLength={50} />
                    </div>
                    <div className="field">
                      <label>Şehir</label>
                      <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Ofis Adı</label>
                    <input value={officeName} onChange={(e) => setOfficeName(e.target.value)} maxLength={255} />
                  </div>
                </>
              )}

              {/* Yasal onay — zorunlu kutu işaretlenmeden kayıt gönderilemez; onayın
                  kendisi sunucuda IP ve sürümüyle birlikte saklanır (legal_consents). */}
              <div className="field register-consent">
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    required
                  />
                  <span>
                    <Link to="/yasal/kullanim-kosullari" target="_blank" rel="noreferrer">Kullanım Koşulları</Link>,{' '}
                    <Link to="/yasal/gizlilik" target="_blank" rel="noreferrer">Gizlilik Politikası</Link> ve{' '}
                    <Link to="/yasal/aydinlatma" target="_blank" rel="noreferrer">KVKK Aydınlatma Metni</Link>'ni
                    okudum, kabul ediyorum. <span className="req">*</span>
                  </span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                  />
                  <span>
                    Yeni özellik ve kampanyalardan e-posta ile haberdar olmak istiyorum (isteğe bağlı).
                  </span>
                </label>
              </div>

              <button className="btn" style={{ width: '100%' }} disabled={busy || !acceptedTerms}>
                {busy ? 'Kaydediliyor…' : 'Kayıt Ol'}
              </button>
            </form>
          )}

          <div className="auth-footer-link">
            Zaten hesabınız var mı? <Link to="/login">Giriş Yap</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
