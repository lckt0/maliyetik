import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, Notification } from '../../database/entities';

/**
 * Saklama süresi dolan kayıtları siler.
 *
 * `audit_logs` ve `notifications` bugüne kadar SINIRSIZ büyüyordu: her giriş, her
 * evrak işlemi, her bildirim kalıcıydı. Bu iki tablo hem diski (paylaşımlı ve dolu)
 * hem de KVKK'yı ilgilendiriyor — "gerektiği süre kadar saklama" ilkesi gereği
 * süresiz tutmak başlı başına bir aykırılık.
 *
 * Süreler, kullanıcıya gösterilen KVKK Aydınlatma Metni'ndeki tabloyla AYNI olmalı
 * (frontend/src/legal/metinler/aydinlatma.ts → "Saklama Süreleri"). Biri değişirse
 * diğeri de değişmeli; aksi hâlde beyan ettiğimizden farklı davranmış oluruz.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  /** Aydınlatma metni: "Sistem log ve denetim kayıtları — 2 yıl". */
  private static readonly AUDIT_GUN = 730;
  /** Okunmuş bildirim kısa ömürlü; okunmamış olan daha uzun tutulur. */
  private static readonly OKUNMUS_BILDIRIM_GUN = 90;
  private static readonly BILDIRIM_GUN = 365;
  /** Tek seferde silinecek satır: uzun kilit tutup canlı isteği bekletmesin. */
  private static readonly PARTI = 5_000;

  constructor(
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  /** Her gece 04:15 — mesai başlamadan önce. */
  @Cron('0 15 4 * * *')
  async purgeExpired(): Promise<void> {
    const audit = await this.deleteOlderThan('audit_logs', RetentionService.AUDIT_GUN);
    const okunmus = await this.deleteOlderThan(
      'notifications', RetentionService.OKUNMUS_BILDIRIM_GUN, 'read_at IS NOT NULL',
    );
    const bildirim = await this.deleteOlderThan('notifications', RetentionService.BILDIRIM_GUN);

    if (audit || okunmus || bildirim) {
      this.logger.log(
        `Saklama süresi temizliği: ${audit} denetim kaydı, ${okunmus + bildirim} bildirim silindi.`,
      );
    }
  }

  /**
   * Verilen tablodan `gun` günden eski satırları partiler hâlinde siler.
   * Tablo adı sabitlerden gelir, dışarıdan alınmaz (SQL enjeksiyonu yüzeyi yok).
   */
  private async deleteOlderThan(table: 'audit_logs' | 'notifications', gun: number, ekKosul?: string): Promise<number> {
    const repo = table === 'audit_logs' ? this.audits : this.notifications;
    const sinir = new Date(Date.now() - gun * 86_400_000);
    let toplam = 0;

    // Sonsuz döngüye karşı üst sınır: bir gecede en fazla 500 bin satır.
    for (let i = 0; i < 100; i++) {
      const sonuc = await repo.query(
        `DELETE FROM \`${table}\` WHERE created_at < ?${ekKosul ? ` AND ${ekKosul}` : ''} LIMIT ?`,
        [sinir, RetentionService.PARTI],
      );
      const silinen = Number(sonuc?.affectedRows ?? 0);
      toplam += silinen;
      if (silinen < RetentionService.PARTI) break;
    }
    return toplam;
  }
}
