import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { lookup } from 'dns/promises';
import type { Browser, HTTPRequest } from 'puppeteer-core';

/** `networkidle0` için üst sınır — aşılırsa dönüşüm iptal edilmez, o anki hâl basılır. */
const NETWORK_IDLE_TIMEOUT_MS = 15_000;

/** Yerel/özel ağ blokları — yüklenen HTML'in backend'i iç servislere yönlendirmesini engeller. */
const PRIVATE_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/**
 * HTML→PDF dönüşümü — headless Chromium (puppeteer-core, sistem paketi:
 * bkz. Dockerfile `apk add chromium`). Tek bir paylaşılan Browser instance'ı
 * modül ömrü boyunca açık tutulur; her istekte yeni tarayıcı açmak pahalı.
 * `waitUntil: 'networkidle0'`, Luca e-Arşiv/e-Fatura HTML çıktılarındaki
 * JS ile render edilen QR kodunun PDF'e basılmadan önce çizilmesini sağlar.
 */
@Injectable()
export class HtmlToPdfService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HtmlToPdfService.name);
  private browser: Browser | null = null;

  async onModuleInit(): Promise<void> {
    try {
      this.browser = await this.launch();
    } catch (err) {
      this.logger.warn(`Chromium başlatılamadı — HTML→PDF dönüşümü ilk kullanımda tekrar denenecek. ${err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
  }

  private async launch(): Promise<Browser> {
    const puppeteer = await import('puppeteer-core');
    return puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    this.browser = await this.launch();
    return this.browser;
  }

  /**
   * Yüklenen HTML'in tetiklediği alt kaynak isteklerini süzer.
   *
   * Evrak HTML'i kullanıcıdan geliyor; Chromium bunu backend'in ağından yüklediği için
   * `<img src="http://mysql:3306/...">` gibi bir referans, dışarıdan erişilemeyen iç
   * servislere istek attırmanın (SSRF) yolu olurdu. Şema veya hedef yerel/özel ağdaysa
   * istek daha çıkmadan kesilir — faturanın kendi içeriği (inline stil/script, data: URI)
   * bundan etkilenmez.
   */
  private async shouldBlock(req: HTTPRequest): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(req.url());
    } catch {
      return true;
    }
    if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return false;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (/^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i.test(host)) return true;

    // İsim, özel bir adrese çözülüyorsa da engellenir (ör. kendi domain'i 127.0.0.1'e bakan bir ad).
    try {
      const { address } = await lookup(host);
      if (PRIVATE_IPV4.test(address)) return true;
      if (address === '::1' || /^f[cd]/i.test(address) || /^fe80:/i.test(address)) return true;
    } catch {
      return true; // çözülemiyorsa zaten yüklenemez; beklemeye gerek yok
    }
    return false;
  }

  async convert(html: Buffer | string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        void this.shouldBlock(req)
          .then((block) => (block ? req.abort('blockedbyclient') : req.continue()))
          .catch(() => undefined); // yarışta istek çoktan ele alınmışsa yut
      });

      try {
        await page.setContent(html.toString('utf-8'), {
          waitUntil: 'networkidle0',
          timeout: NETWORK_IDLE_TIMEOUT_MS,
        });
      } catch (err) {
        // Ulaşılamayan bir dış kaynak (yavaş CDN, kapalı host) networkidle0'ı bekletiyor.
        // Eskiden bu, dönüşümü tümden başarısız kılıyordu — tek bir logo yüzünden evrak
        // içe aktarılamıyordu. Artık o ana kadar render edilmiş hâli basıyoruz.
        if ((err as Error)?.name !== 'TimeoutError') throw err;
        this.logger.warn(
          `HTML→PDF: dış kaynaklar ${NETWORK_IDLE_TIMEOUT_MS} ms içinde tamamlanmadı, ` +
          'sayfanın o anki hâli basılıyor.',
        );
      }

      const pdf = await page.pdf({ format: 'a4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}
