import { ReactNode, useEffect, useRef, useState } from 'react';

/** Bölüm görünüme girdiğinde yumuşak bir fade+slide animasyonuyla belirir (bir kez, sonra sabit kalır). */
export function ScrollReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`scroll-reveal ${visible ? 'in-view' : ''} ${className}`}>
      {children}
    </div>
  );
}
