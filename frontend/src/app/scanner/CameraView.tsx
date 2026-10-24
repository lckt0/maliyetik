import { useCallback, useEffect, useRef, useState } from 'react';
import { SITE_HOST } from '../../site';

/** `torch`, standart MediaTrack tiplerinde yok — Chrome/Android'e özgü uzantı. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

export type CameraError =
  | { kind: 'denied' }        // kullanıcı izni reddetti
  | { kind: 'missing' }       // cihazda kamera yok
  | { kind: 'insecure' }      // HTTPS değil → getUserMedia hiç yok
  | { kind: 'other'; message: string };

interface CameraState {
  /**
   * `<video>` elemanına verilecek callback ref. Düz bir RefObject yetmiyor: tarayıcı
   * kırpma adımına geçtiğinde video DOM'dan kalkıyor, geri dönüldüğünde YENİ bir eleman
   * mount oluyor ve akış ona hiç bağlanmadığı için ikinci çekim boş kare veriyordu.
   * Callback ref, eleman her bağlandığında akışı yeniden iliştirir.
   */
  attachVideo: (el: HTMLVideoElement | null) => void;
  ready: boolean;
  error: CameraError | null;
  torchSupported: boolean;
  torchOn: boolean;
  toggleTorch: () => void;
  /** Canlı görüntüden tam çözünürlüklü tek kare alır. */
  capture: () => ImageData | null;
  retry: () => void;
}

/**
 * Arka kamerayı açar ve kare yakalama sunar.
 *
 * iOS notları:
 *  - `<video>` mutlaka `playsInline` + `muted` olmalı, aksi halde Safari videoyu tam
 *    ekran oynatıcıya alır ve tarayıcı arayüzü kaybolur.
 *  - `getUserMedia` yalnızca güvenli bağlamda (HTTPS veya localhost) vardır.
 *  - Fener (torch) iOS Safari'de DESTEKLENMEZ; yetenek testiyle düğme gizlenir.
 *  - `ImageCapture` API'si iOS'ta yok — kare, video'dan canvas'a çizilerek alınır.
 */
export function useCamera(): CameraState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /** Akışı verilen video elemanına bağlar ve oynatmayı başlatır. */
  const bind = useCallback((video: HTMLVideoElement | null) => {
    if (!video || !streamRef.current || video.srcObject === streamRef.current) return;
    video.srcObject = streamRef.current;
    // iOS'ta play() reddedilebilir (arka plandaki sekme); görünürlük dinleyicisi tekrar dener.
    void video.play().catch(() => undefined);
  }, []);

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    bind(el);
  }, [bind]);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      setReady(false);
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError({ kind: window.isSecureContext ? 'missing' : 'insecure' });
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` bilinçli: `exact` verilirse arka kamerası olmayan cihazlarda
          // (masaüstü, bazı tabletler) istek tümden başarısız olurdu.
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
          audio: false,
        });

        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        bind(videoRef.current);

        const capabilities = stream.getVideoTracks()[0]?.getCapabilities?.() as TorchCapabilities | undefined;
        if (!cancelled) {
          setTorchSupported(Boolean(capabilities?.torch));
          setReady(true);
        }
      } catch (e) {
        if (cancelled) return;
        const err = e as DOMException;
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') setError({ kind: 'denied' });
        else if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') setError({ kind: 'missing' });
        else setError({ kind: 'other', message: err.message || 'Kamera açılamadı.' });
      }
    }

    void open();

    return () => {
      cancelled = true;
      // Akış durdurulmazsa kamera ışığı yanık kalır ve pil tükenir.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [attempt, bind]);

  // Sekme arka plandan döndüğünde iOS videoyu duraklatmış olabilir.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      bind(videoRef.current);
      void videoRef.current?.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [bind]);

  const toggleTorch = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    track.applyConstraints({ advanced: [{ torch: next } as TorchConstraint] })
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false));   // yetenek bildirildi ama uygulanamadı
  }, [torchOn]);

  const capture = useCallback((): ImageData | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = canvasRef.current ??= document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { attachVideo, ready, error, torchSupported, torchOn, toggleTorch, capture, retry };
}

export const CAMERA_ERROR_TEXT: Record<CameraError['kind'], { title: string; body: string }> = {
  denied: {
    title: 'Kamera izni gerekli',
    body: 'Belge taramak için kamera erişimine izin vermeniz gerekiyor. Tarayıcı ayarlarından bu site için kamerayı açıp tekrar deneyin.',
  },
  missing: {
    title: 'Kamera bulunamadı',
    body: 'Bu cihazda kullanılabilir bir kamera görünmüyor. Aşağıdan galerinizden fotoğraf seçebilirsiniz.',
  },
  insecure: {
    title: 'Güvenli bağlantı gerekli',
    body: `Kamera yalnızca HTTPS üzerinden çalışır. Lütfen uygulamayı https://${SITE_HOST} adresinden açın.`,
  },
  other: { title: 'Kamera açılamadı', body: '' },
};
