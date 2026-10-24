import { ToolIcon } from '../components/Icons';

/** Bakım modu aktifken, allowlist dışındaki her istekte tüm uygulamanın yerini alır. */
export function MaintenancePage() {
  return (
    <div className="login-wrap">
      <div className="card login-card" style={{ textAlign: 'center' }}>
        <div className="brand">Maliyetik</div>
        <div style={{ margin: '1.5rem 0', display: 'flex', justifyContent: 'center', color: 'var(--muted)' }}>
          <ToolIcon width={40} height={40} />
        </div>
        <h2 style={{ margin: '0 0 .5rem' }}>Sistem Bakımda</h2>
        <p className="muted">
          Maliyetik şu anda planlı bakım çalışması nedeniyle geçici olarak hizmet veremiyor.
          Lütfen daha sonra tekrar deneyin.
        </p>
      </div>
    </div>
  );
}
