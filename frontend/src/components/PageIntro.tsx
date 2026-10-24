import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  icon?: ReactNode;
  title: string;
  /** Sayfanın ne işe yaradığı — bir cümle, jargonsuz. */
  children: ReactNode;
  /** Sayfadan mantıklı bir sonraki adım (opsiyonel). */
  action?: { to: string; label: string; icon?: ReactNode };
}

/**
 * Sayfa başlığı + "bu sayfa ne işe yarar" açıklaması.
 *
 * Panelde çoğu sayfa doğrudan bir tabloyla açılıyordu; kullanıcı nerede olduğunu ve
 * burada ne yapabileceğini ancak deneyerek anlıyordu. Tek bir yerden gelen kısa
 * açıklama, sayfalar arasında tutarlı bir giriş sağlıyor.
 */
export function PageIntro({ icon, title, children, action }: Props) {
  return (
    <div className="page-intro">
      <div className="page-intro-text">
        <h2>{icon}{title}</h2>
        <p className="muted">{children}</p>
      </div>
      {action && (
        <Link className="btn" to={action.to}>{action.icon}{action.label}</Link>
      )}
    </div>
  );
}
