import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Configuration } from '../../config/configuration';
import { DocumentType, User } from '../../database/entities';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';
import { AccessControlService } from '../authorizations/access-control.service';
import { SettingsService } from '../settings/settings.service';
import { GeminiService } from '../ai/gemini.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AiInsightsService, Insight } from './ai-insights.service';
import { AiUsageService } from './ai-usage.service';

export interface SearchFilterResult {
  /** Arayüzün doğrudan uygulayabileceği filtre — model serbest metin döndüremez. */
  filter: {
    documentTypeCode?: string;
    dateFrom?: string;
    dateTo?: string;
    direction?: 'alis' | 'satis';
    amountMin?: number;
    amountMax?: number;
    q?: string;
  };
  /** Modelin filtreyi nasıl anladığı — kullanıcı yanlış anlaşıldığını görebilsin. */
  explanation: string;
}

export interface InsightsResult {
  insights: Insight[];
  /** Yapay zeka açıksa bulguları özetleyen kısa metin; kapalıysa null. */
  summary: string | null;
  aiEnabled: boolean;
  generatedAt: string;
}

/** Özet önbelleği — aynı bulgular için tekrar tekrar model çağırmaya gerek yok. */
const SUMMARY_TTL_SECONDS = 6 * 60 * 60;
/**
 * Önbellek anahtarındaki sürüm. İstem metni ya da model değiştiğinde ARTIRILIR: aksi
 * hâlde eski özetler TTL bitene kadar gösterilmeye devam eder.
 */
const SUMMARY_CACHE_VERSION = 'v2';

/**
 * "Yapay zeka deneyimi" — evrak okuma/dijitalleştirme dışındaki hafif AI özellikleri.
 *
 * Tasarım ilkeleri:
 *  - UCUZ MODEL. Bu işlerin hiçbiri görsel anlama gerektirmiyor; hepsi ucuz metin
 *    modeliyle (GEMINI_MODEL_CHEAP) çalışır ve AI kredisi TÜKETMEZ — maliyeti abonelik
 *    fiyatına dahildir. Kötüye kullanımı `AiUsageService` günlük tavanı önler.
 *  - VERİ MODELE GİTMEZ. Doğal dil aramada model yalnızca sorguyu filtreye çevirir;
 *    evrak içeriği, tutarlar ve karşı taraf bilgileri gönderilmez. Özet ve yardımcıda
 *    yalnızca sayılar/olgular gider, evrak metni gitmez.
 *  - AI KAPALIYKEN ÖZELLİK ÇALIŞMAYA DEVAM EDER. Anomali tespiti deterministiktir;
 *    yapay zeka yalnızca anlatım katmanıdır. Kullanıcı Ayarlar'dan kapattığında bulgular
 *    ham hâliyle görünmeye devam eder.
 */
@Injectable()
export class AiAssistService {
  private readonly logger = new Logger(AiAssistService.name);

  constructor(
    @InjectRepository(DocumentType) private readonly types: Repository<DocumentType>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: AccessControlService,
    private readonly settings: SettingsService,
    private readonly gemini: GeminiService,
    private readonly redis: RedisService,
    private readonly insightsService: AiInsightsService,
    private readonly usage: AiUsageService,
    private readonly config: ConfigService<Configuration, true>,
  ) {}

  /**
   * Hafif özellikler için model. Dijitalleştirmedeki modelden AYRI: burada düşünme
   * kapatılıyor ve `gemini-flash-latest` bu parametreyi kabul etmiyor (bkz. env.validation).
   */
  private lightModel(): string {
    return this.config.get('gemini', { infer: true }).modelLight;
  }

  /**
   * Yapay zeka deneyimi bu kullanıcı için açık mı — üç kapı birden:
   * sistem yapılandırması (API anahtarı), admin rol anahtarı ve kullanıcının kendi tercihi.
   */
  async isEnabledFor(userId: string, role: Role): Promise<boolean> {
    if (!this.config.get('gemini', { infer: true }).apiKey) return false;
    const s = this.settings.getCached();
    const roleAllowed = role === Role.ACCOUNTANT ? s.accountantAiEnabled
      : role === Role.TAXPAYER ? s.taxpayerAiEnabled : true;
    if (!roleAllowed) return false;
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'uiPreferences'] });
    // Tercih hiç kaydedilmemişse açık kabul edilir.
    return user?.uiPreferences?.aiExperience !== false;
  }

  private async assertEnabled(user: AuthUser, feature: 'search' | 'ask' | 'insight'): Promise<void> {
    if (!await this.isEnabledFor(user.userId, user.role)) {
      throw new ForbiddenException('Yapay zeka deneyimi kapalı. Ayarlar > Yapay Zeka bölümünden açabilirsiniz.');
    }
    if (!await this.usage.consume(user.userId, feature)) {
      throw new ForbiddenException('Bugünkü yapay zeka kullanım hakkınız doldu. Yarın tekrar deneyebilirsiniz.');
    }
  }

  // ------------------------------------------------------- doğal dille arama

  /**
   * Serbest metni evrak filtresine çevirir. Model YALNIZCA filtre üretir; sonucu
   * uygulayan ve yetkiyi denetleyen taraf her zaman mevcut `/documents` ucudur.
   */
  async searchFilter(user: AuthUser, query: string): Promise<SearchFilterResult> {
    await this.assertEnabled(user, 'search');

    const types = await this.types.find({ where: { isActive: 1 } });
    const today = new Date().toISOString().slice(0, 10);

    const parsed = await this.gemini.generateJson<{
      documentTypeCode?: string; dateFrom?: string; dateTo?: string;
      direction?: string; amountMin?: number; amountMax?: number; q?: string; explanation?: string;
    }>(this.lightModel(), {
      contents: [{
        parts: [{
          text: [
            'Kullanıcının Türkçe evrak arama isteğini yapılandırılmış bir filtreye çevir.',
            `Bugünün tarihi: ${today}.`,
            `Kullanılabilir evrak türü kodları: ${types.map((t) => `${t.code} (${t.name})`).join(', ')}.`,
            'Tarihleri YYYY-AA-GG biçiminde ver. "geçen ay", "bu yıl", "son 3 ay" gibi ifadeleri',
            'bugünün tarihine göre gerçek tarih aralığına çevir.',
            'direction yalnızca "alis" (alış/gelen) veya "satis" (satış/kesilen) olabilir.',
            'q alanına yalnızca karşı taraf ünvanı / belge no gibi serbest metin arama terimini koy.',
            'Emin olmadığın alanı BOŞ bırak — tahmin etme.',
            'explanation alanına filtreyi tek cümleyle Türkçe açıkla.',
            `Kullanıcının isteği: "${query}"`,
          ].join(' '),
        }],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            documentTypeCode: { type: 'STRING' },
            dateFrom: { type: 'STRING' },
            dateTo: { type: 'STRING' },
            direction: { type: 'STRING' },
            amountMin: { type: 'NUMBER' },
            amountMax: { type: 'NUMBER' },
            q: { type: 'STRING' },
            explanation: { type: 'STRING' },
          },
          required: ['explanation'],
        },
      },
    });

    // Model çıktısı doğrulanır: var olmayan tür kodu ve biçimsiz tarih düşürülür,
    // aksi hâlde arayüz sessizce boş sonuç gösterirdi.
    const validCode = types.some((t) => t.code === parsed.documentTypeCode) ? parsed.documentTypeCode : undefined;
    const isoDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const direction = parsed.direction === 'alis' || parsed.direction === 'satis' ? parsed.direction : undefined;

    return {
      filter: {
        documentTypeCode: validCode,
        dateFrom: isoDate(parsed.dateFrom),
        dateTo: isoDate(parsed.dateTo),
        direction,
        amountMin: Number.isFinite(parsed.amountMin) ? parsed.amountMin : undefined,
        amountMax: Number.isFinite(parsed.amountMax) ? parsed.amountMax : undefined,
        q: parsed.q?.trim() || undefined,
      },
      explanation: parsed.explanation?.trim() || 'Arama filtresi oluşturuldu.',
    };
  }

  // -------------------------------------------------- bulgular + dönem özeti

  /**
   * Mükellefin evrak akışındaki bulgular + (AI açıksa) kısa özet.
   *
   * Bulgular her çağrıda yeniden hesaplanır (ucuz, veritabanı işi); yalnızca ANLATIM
   * önbelleklenir — aynı bulgu kümesi için gün içinde tekrar tekrar model çağrılmaz.
   */
  async insights(user: AuthUser, taxpayerId: string): Promise<InsightsResult> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);
    const insights = await this.insightsService.detect(taxpayerId);
    const aiEnabled = await this.isEnabledFor(user.userId, user.role);

    if (!aiEnabled || !insights.length) {
      return { insights, summary: null, aiEnabled, generatedAt: new Date().toISOString() };
    }

    // Önbellek anahtarı bulguların kendisinden türetilir: bulgular değişmediyse
    // özet de değişmez.
    const fingerprint = insights.map((i) => `${i.code}:${i.title}`).join('|');
    const cacheKey = `ai_summary:${SUMMARY_CACHE_VERSION}:${taxpayerId}:${Buffer.from(fingerprint).toString('base64').slice(0, 80)}`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) return { insights, summary: cached, aiEnabled, generatedAt: new Date().toISOString() };
    } catch { /* önbellek yoksa modele git */ }

    if (!await this.usage.consume(user.userId, 'insight')) {
      return { insights, summary: null, aiEnabled, generatedAt: new Date().toISOString() };
    }

    let summary: string | null = null;
    try {
      const facts = insights.map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`).join('\n');
      summary = await this.gemini.generateText(this.lightModel(), [
        'Bir mali müşavir yazılımının panelinde göstereceğim kısa bir durum özeti yaz.',
        'Aşağıda bir mükellefin evrak akışında tespit edilen olgular var.',
        'En fazla 3 cümle yaz, sonra en fazla 3 maddelik "yapılacaklar" listesi ver.',
        'Yeni bilgi UYDURMA, yalnızca verilen olguları kullan. Sade ve doğrudan yaz.',
        '', facts,
      ].join('\n'), { maxOutputTokens: 300 });
      if (summary) {
        await this.redis.client.set(cacheKey, summary, 'EX', SUMMARY_TTL_SECONDS).catch(() => undefined);
      }
    } catch (err) {
      this.logger.warn(`Dönem özeti üretilemedi: ${(err as Error).message}`);
    }

    return { insights, summary, aiEnabled, generatedAt: new Date().toISOString() };
  }

  // ------------------------------------------------------------- yardımcı

  /**
   * Panel içi soru-cevap. Model yalnızca ürünün nasıl çalıştığını anlatır; kullanıcının
   * evrak içeriğine erişmez. Bilmediğini uydurmaması ve destek gerektiren konuları
   * yönlendirmesi için sistem yönergesi verilir.
   */
  async ask(user: AuthUser, question: string): Promise<{ answer: string }> {
    await this.assertEnabled(user, 'ask');
    const roleLabel = user.role === Role.ACCOUNTANT ? 'mali müşavir'
      : user.role === Role.TAXPAYER ? 'mükellef' : 'sistem yöneticisi';

    const answer = await this.gemini.generateText(this.lightModel(), question, {
      maxOutputTokens: 450,
      systemInstruction: [
        'Maliyetik adlı bir mali evrak yönetim yazılımının panel içi yardımcısısın.',
        `Kullanıcının rolü: ${roleLabel}. Türkçe, kısa ve doğrudan cevap ver.`,
        '',
        'Ürün hakkında bilmen gerekenler:',
        '- Evraklar "Evrak Yükle" sayfasından yüklenir. Sekmeler: Evrak Kayıt (hızlı toplu),',
        '  Detaylı Yükleme (tek evrak, tüm alanlar), Toplu ZIP, Çoklu Fatura PDF ve',
        '  müşavirler için Luca\'dan İçe Aktar.',
        '- Hızlı yüklenen evrakların alanları boştur ve "Evrak Dijitalleştir" sayfasında',
        '  tamamlanır. Alanları eksik evrak listelerde filtrelenemez ve KDV hesabına girmez.',
        '- Evrak kotası, o an DURAN evrak sayısıdır. Çöp kutusundaki evrak kotadan düşmeye',
        '  devam eder; kota ancak KALICI silmede iade edilir.',
        '- Şirket Evraklarım (imza sirküsü, vergi levhası vb.) kota tüketmez.',
        '- KDV Hesaplama, seçilen tarih aralığında dijitalleştirilmiş evrakların KDV toplamını verir.',
        '- Müşavir, mükellefin kendisine AKTİF yetki vermesiyle erişim kazanır; mükellef bu',
        '  yetkiyi istediği zaman geri alabilir.',
        '- Z-Raporları "Fiş Grubu" ile gruplanır ve Dışa Aktar sayfasından Luca fişi olarak indirilir.',
        '- Her tarayıcı penceresi kendi mükellefini hatırlar; müşavir aynı anda birden fazla',
        '  mükellefle çalışabilir.',
        '',
        'Kurallar: Bilmediğin bir şeyi UYDURMA — "bu konuda emin değilim, destek ile',
        'iletişime geçin" de. Vergi/muhasebe DANIŞMANLIĞI verme; yazılımın nasıl',
        'kullanılacağını anlat. Fiyat ve plan sorularında "Aboneliğim" sayfasına yönlendir.',
      ].join('\n'),
    });

    return { answer: answer || 'Bu soruya şu an cevap veremedim, lütfen tekrar deneyin.' };
  }
}
