import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { Configuration } from '../../config/configuration';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';
import { SettingsService } from '../settings/settings.service';
import { AiCreditsService } from '../ai-credits/ai-credits.service';
import { GeminiService, MaliHafizaExtractionResult } from './gemini.service';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Bunun altında rakamlar fiziksel olarak okunamayacak kadar küçük olur — Gemini'ye hiç gönderilmez. */
const MIN_USABLE_MEGAPIXELS = 0.5;
/** Bunun altında Gemini yine de dener ama kullanıcı düşük çözünürlük konusunda uyarılır. */
const RECOMMENDED_MEGAPIXELS = 3;

/**
 * "Mali Hafıza Raporu" fotoğrafından Gemini ile çoklu-şerit/çoklu-gün Z-Raporu çıkarımı.
 * `AiDigitizeService` ile aynı desen (kredi düş → dene → hata olursa iade) — tek fark
 * tek bir alan seti değil, şerit+entry dizisi dönmesi. Sonuç kalıcı hale GELMEZ; kullanıcı
 * gözden geçirip KDV oranı/ödeme türünü seçtikten sonra `DocumentsService.commitMaliHafiza`
 * ile kaydeder.
 */
@Injectable()
export class MaliHafizaExtractService {
  constructor(
    private readonly settings: SettingsService,
    private readonly aiCredits: AiCreditsService,
    private readonly gemini: GeminiService,
    private readonly config: ConfigService<Configuration, true>,
  ) {}

  async extract(user: AuthUser, file: { buffer: Buffer; mimetype: string }): Promise<MaliHafizaExtractionResult> {
    if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Mali Hafıza Raporu için yalnızca görsel dosyası (jpg, png vb.) yüklenebilir.');
    }

    const settings = this.settings.getCached();
    const allowed = user.role === Role.ACCOUNTANT ? settings.accountantAiEnabled : settings.taxpayerAiEnabled;
    if (!allowed) throw new ForbiddenException('Yapay zeka ile dijitalleştirme hesabınız için kapatılmış.');

    // Çözünürlük kontrolü Gemini'ye HİÇ gitmeden önce yapılır — modelin kendi "readable"
    // öz-değerlendirmesi tek başına yeterli değil (bulanık/düşük çözünürlüklü fotoğraflarda bile
    // fazla iyimser olabiliyor); dosyanın piksel boyutu bağımsız, deterministik bir sinyaldir.
    const megapixels = await this.readMegapixels(file.buffer);
    if (megapixels !== null && megapixels < MIN_USABLE_MEGAPIXELS) {
      throw new BadRequestException(
        'Fotoğrafın çözünürlüğü rakamların okunamayacağı kadar düşük. Lütfen daha yüksek çözünürlüklü, netliğe odaklanmış bir fotoğraf yükleyin.',
      );
    }

    await this.aiCredits.consume(user.userId, 1);

    try {
      const gemini = this.config.get('gemini', { infer: true });
      const result = await this.gemini.extractMaliHafiza(gemini.modelAdvanced, { buffer: file.buffer, mimeType: file.mimetype });

      if (!result.strips.length) {
        throw new BadRequestException(
          result.overallIssue || 'Görselde bir Mali Hafıza Raporu şeridi tanınamadı. Lütfen fotoğrafı netleştirip tekrar deneyin.',
        );
      }
      // Hiçbir şerit okunabilir değilse (tamamı bulanık/netliksiz) gözden geçirme ekranına hiç
      // geçirmeden durdur — kullanıcı yanlış/tahmini rakamları fark etmeden kaydetmesin.
      if (result.strips.every((s) => !s.readable)) {
        const detail = result.strips.map((s) => s.issue).filter(Boolean).join(' ');
        throw new BadRequestException(
          `Fotoğraf yeterince net değil, rakamlar güvenle okunamadı.${detail ? ` ${detail}` : ''} Lütfen daha net/aydınlık bir fotoğraf ile tekrar deneyin.`,
        );
      }
      if (megapixels !== null && megapixels < RECOMMENDED_MEGAPIXELS) {
        result.resolutionWarning = 'Fotoğrafın çözünürlüğü tavsiye edilenden düşük — bazı rakamlar hatalı okunmuş olabilir, kaydetmeden önce tüm satırları dikkatle kontrol edin.';
      }
      return result;
    } catch (err) {
      await this.aiCredits.refund(user.userId, 1, undefined, 'Mali Hafıza Raporu çıkarımı başarısız oldu').catch(() => undefined);
      throw err;
    }
  }

  /** Bozuk/tanınamayan dosyada `null` döner — bu durumda çözünürlük kontrolü sessizce atlanır, Gemini yine de dener. */
  private async readMegapixels(buffer: Buffer): Promise<number | null> {
    try {
      const meta = await sharp(buffer, { limitInputPixels: false }).metadata();
      if (!meta.width || !meta.height) return null;
      return (meta.width * meta.height) / 1_000_000;
    } catch {
      return null;
    }
  }
}
