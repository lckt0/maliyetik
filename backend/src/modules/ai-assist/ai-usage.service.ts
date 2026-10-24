import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service';

/**
 * Hafif AI özelliklerinin günlük çağrı tavanları (kullanıcı başına).
 *
 * Tipik çağrı 400-500 token civarındadır. Tavanlar olağan kullanımın çok üstünde,
 * ama kötüye kullanımda maliyet sınırsız büyümesin diye konmuştur. Bulgu özeti
 * ayrıca 6 saat önbelleklenir, o yüzden tavanı en düşük olan odur.
 */
export const AI_DAILY_LIMITS: Record<AiFeature, number> = {
  search: 40,
  ask: 25,
  insight: 20,
};

export type AiFeature = 'search' | 'ask' | 'insight';

/**
 * "Yapay zeka deneyimi" çağrılarının sayacı ve tavanı.
 *
 * Bu özellikler AI kredisi TÜKETMEZ (abonelik fiyatına dahildir), ama bedava da değildir.
 * Tavan olmadan tek bir hesap, ürünün tüm marjını yiyebilecek bir fatura üretebilir —
 * bu yüzden kullanıcı+özellik başına günlük sayaç tutulur. Sayaç Redis'te, gün sonunda
 * kendiliğinden düşen bir TTL ile saklanır.
 *
 * Redis erişilemezse çağrı ENGELLENMEZ (özellik çalışmaya devam eder), yalnızca loglanır:
 * sayaç bir güvenlik denetimi değil maliyet freni; önbellek arızası kullanıcıyı kesmemeli.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly redis: RedisService) {}

  private key(userId: string, feature: AiFeature): string {
    const day = new Date().toISOString().slice(0, 10);
    return `ai_usage:${day}:${feature}:${userId}`;
  }

  /** Sayacı artırır ve tavan aşıldıysa false döner. */
  async consume(userId: string, feature: AiFeature): Promise<boolean> {
    try {
      const key = this.key(userId, feature);
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, 26 * 60 * 60);
      return count <= AI_DAILY_LIMITS[feature];
    } catch (err) {
      this.logger.warn(`AI kullanım sayacı okunamadı: ${(err as Error).message}`);
      return true;
    }
  }

  async remaining(userId: string, feature: AiFeature): Promise<number> {
    try {
      const used = Number(await this.redis.client.get(this.key(userId, feature)) ?? 0);
      return Math.max(0, AI_DAILY_LIMITS[feature] - used);
    } catch {
      return AI_DAILY_LIMITS[feature];
    }
  }
}
