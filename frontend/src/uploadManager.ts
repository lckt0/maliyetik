import { useCallback, useSyncExternalStore } from 'react';
import { apiError } from './api/client';
import { bumpData } from './dataBus';
import { useTabScope } from './tabs';

export interface UploadFileResult {
  name: string;
  /** Kullanıcının verdiği evrak başlığı (varsa) — sırada dosya adı yerine gösterilir. */
  title?: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export interface UploadJob {
  id: string;
  label: string;
  total: number;
  completed: number;
  failed: number;
  percent: number;
  status: 'running' | 'done' | 'error';
  files: UploadFileResult[];
}

type Listener = () => void;

/**
 * Yükleme işleri SEKME BAŞINA tutulur.
 *
 * Önceden modül düzeyinde TEK bir iş vardı; her pencere ayrı bir sekme/JS bağlamı
 * olduğu için bu yeterliydi. Uygulama tek pencerede sekmelere geçince yetmez oldu:
 * bir sekmede yükleme sürerken diğerinde yükleme başlatmak, ilk işin döngüsünü
 * (`job.id !== id` kontrolü) durduruyor ve KALAN DOSYALAR SESSİZCE YÜKLENMİYORDU.
 * Artık her sekme kendi işini görür ve kendi ilerlemesini gösterir.
 */
const jobs = new Map<string, UploadJob>();
const listeners = new Set<Listener>();

/** Sekme sistemi dışında (mobil PWA, giriş sonrası tek sayfa) tek bir sahip yeter. */
const DEFAULT_OWNER = 'default';

function setJob(owner: string, next: UploadJob | null) {
  if (next) jobs.set(owner, next); else jobs.delete(owner);
  listeners.forEach((l) => l());
}

function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function useOwner(): string {
  return useTabScope()?.tabId ?? DEFAULT_OWNER;
}

/**
 * Bu sekmenin aktif toplu yükleme işi — component ömründen bağımsız (modül düzeyinde)
 * tutulur ki kullanıcı sayfa değiştirdiğinde yükleme kesilmesin, ilerleme bildirim
 * zilinde de görünsün.
 */
export function useUploadJob(): UploadJob | null {
  const owner = useOwner();
  const snapshot = useCallback(() => jobs.get(owner) ?? null, [owner]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

let jobCounter = 0;
const CLEAR_AFTER_MS = 8000;

interface StartBatchUploadOptions {
  label: string;
  files: File[];
  /** `files` ile aynı sırada, gösterim amaçlı evrak başlıkları (opsiyonel). */
  titles?: (string | undefined)[];
  upload: (file: File, onProgress: (pct: number) => void, index: number) => Promise<void>;
}

/**
 * Çoklu dosya yüklemeyi başlatıp arka planda (fire-and-forget) yürütür. Çağıran
 * component unmount olsa da (kullanıcı sayfa değiştirse, hatta sekmeyi kapatsa da)
 * döngü modül düzeyindeki kapanışta çalışmaya devam eder — ilerleme aynı sekmede
 * `useUploadJob()` ile okunur.
 */
export function useStartBatchUpload(): (opts: StartBatchUploadOptions) => void {
  const owner = useOwner();
  return useCallback((opts: StartBatchUploadOptions) => startOwnedBatchUpload(owner, opts), [owner]);
}

/**
 * React dışından yükleme başlatır (mobil tarayıcı akışı, bkz. app/scanner/captureUpload.ts).
 * Mobil PWA'da sekme sistemi yok; tek sahip yeterli.
 */
export function startBatchUpload(opts: StartBatchUploadOptions): void {
  startOwnedBatchUpload(DEFAULT_OWNER, opts);
}

function startOwnedBatchUpload(owner: string, opts: StartBatchUploadOptions): void {
  const id = `upload-${++jobCounter}-${Date.now()}`;
  /** İşin güncel hâli — başka bir iş bu sekmeyi devraldıysa null'a düşer. */
  const mine = (): UploadJob | null => {
    const job = jobs.get(owner);
    return job && job.id === id ? job : null;
  };

  setJob(owner, {
    id,
    label: opts.label,
    total: opts.files.length,
    completed: 0,
    failed: 0,
    percent: opts.files.length ? 0 : 100,
    status: 'running',
    files: opts.files.map((f, i) => ({ name: f.name, title: opts.titles?.[i], status: 'pending' })),
  });
  void run();

  async function run() {
    for (let i = 0; i < opts.files.length; i++) {
      if (!mine()) return;
      patchFile(owner, id, i, { status: 'uploading' });

      let error: string | undefined;
      try {
        await opts.upload(opts.files[i], (pct) => {
          const job = mine();
          if (!job) return;
          const overall = Math.round(((job.completed + pct / 100) / job.total) * 100);
          setJob(owner, { ...job, percent: overall });
        }, i);
      } catch (err) {
        // `apiError` backend'in gönderdiği asıl nedeni (ör. "bu dosya zaten yüklenmiş") çıkarır —
        // düz `err.message` axios'un "Request failed with status code 409" gibi anlamsız
        // genel metnini verirdi, kullanıcı gerçek nedeni hiç göremezdi.
        error = apiError(err);
      }

      if (!mine()) return;
      patchFile(owner, id, i, error ? { status: 'error', error } : { status: 'done' });
      const job = mine();
      if (!job) return;
      const completed = job.completed + 1;
      const failed = job.failed + (error ? 1 : 0);
      setJob(owner, { ...job, completed, failed, percent: Math.round((completed / job.total) * 100) });
    }

    const job = mine();
    if (job) {
      // Yükleme bittiğinde açık olan evrak listeleri / kota göstergeleri kendiliğinden
      // tazelensin — kullanıcı sayfayı yenilemek zorunda kalmasın (bkz. dataBus.ts).
      bumpData('documents', 'company-documents', 'quota');
      setJob(owner, { ...job, status: job.failed ? 'error' : 'done', percent: 100 });
      // Sekme bu arada kapanmış olabilir; kayıt silinince harita da temizlenir.
      setTimeout(() => { if (mine()) setJob(owner, null); }, CLEAR_AFTER_MS);
    }
  }
}

function patchFile(owner: string, id: string, index: number, patch: Partial<UploadFileResult>): void {
  const job = jobs.get(owner);
  if (!job || job.id !== id) return;
  const files = job.files.slice();
  files[index] = { ...files[index], ...patch };
  setJob(owner, { ...job, files });
}
