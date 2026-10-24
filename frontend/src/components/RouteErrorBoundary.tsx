import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Rota ağacındaki render hatalarını yakalar.
 *
 * Öncesinde hiçbir hata sınırı yoktu: tek bir bileşen render sırasında hata atınca React
 * tüm ağacı söküyor ve kullanıcı BOŞ bir sayfa görüyordu — ne mesaj ne de çıkış yolu.
 * Artık ne olduğu yazılıyor ve iki gerçek seçenek veriliyor: yeniden dene (aynı rotayı
 * tekrar bağlar) ve sayfayı yenile (eski bir paket kaldıysa onu da çözer).
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sunucuya hata toplama servisi bağlanana kadar en azından konsolda izlenebilsin.
    console.error('Sayfa yüklenemedi:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ maxWidth: 520, margin: '2rem auto' }}>
        <h3 style={{ marginTop: 0 }}>Sayfa yüklenemedi</h3>
        <p className="muted">
          Bu sayfa açılırken beklenmeyen bir hata oluştu. Uygulama yakın zamanda
          güncellendiyse sayfayı yenilemek genellikle yeterlidir.
        </p>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Sayfayı Yenile
          </button>
          <button type="button" className="btn secondary" onClick={() => this.setState({ error: null })}>
            Yeniden Dene
          </button>
        </div>
      </div>
    );
  }
}
