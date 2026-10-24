import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { AuthorizationStatus } from '../../shared/enums';
import { QuotaService } from '../quota/quota.service';

export interface SeatPlan {
  planName: string;
  /** 0 = sınırsız (mevcut konvansiyon — bkz. BillingService.entitlements). */
  maxTaxpayers: number;
  quotaPerSeat: number;
}

export interface SeatUsage {
  plan: SeatPlan | null;
  used: number;
  /** null = sınırsız ya da plan yok. */
  available: number | null;
}

/**
 * KOLTUK MODELİ.
 *
 * Müşavir mükellef başına öder; her koltuk bir mükellefe evrak tavanı taşır ve mükellef
 * hiçbir ücret ödemez. Karşılığında iki kural işletilir:
 *
 *  1) ÇİFTE ÖDEME YOK — kendi aktif ÜCRETLİ planı olan mükellef koltuk TÜKETMEZ.
 *     Bir mükellef için sistemde tek ödeme yapılır. (Kota tarafında da toplama değil
 *     MAX alınır; bkz. QuotaService.ceilingOf.)
 *
 *  2) MÜŞAVİR DEĞİŞİMİ BEDAVA — yetki kalkınca koltuk aynı dönem içinde boşalır ve
 *     yeniden kullanılabilir. Evrak mükellefindir, taşınmaz; yalnızca yetki el değiştirir.
 *     Eski müşavirin koltuğu kalkınca mükellefin evrakı SİLİNMEZ, arşiv moduna düşer.
 *
 * Bu servis bilerek BillingService'e bağlanmaz (BillingModule zaten AuthorizationsModule'ü
 * içeri alıyor; ters yönde bağımlılık döngü üretirdi) — abonelik verisini doğrudan okur.
 */
@Injectable()
export class SeatsService {
  private readonly logger = new Logger(SeatsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly quota: QuotaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Koltuk sınırı zorlanıyor mu. Varsayılan kapalı (aboneliği olmayan müşavirler
   * çalışmaya devam edebilsin); `ENFORCE_SEAT_LIMITS=true` ile devreye alınır.
   */
  private get enforcing(): boolean {
    return String(this.config.get('ENFORCE_SEAT_LIMITS')) === 'true';
  }

  /** Müşavirin yürürlükteki planındaki koltuk bilgisi. */
  async planFor(accountantProfileId: string, manager?: EntityManager): Promise<SeatPlan | null> {
    const tx = manager ?? this.dataSource.manager;
    const rows: Array<{ planName: string; maxTaxpayers: number; quotaPerSeat: string }> = await tx.query(
      `SELECT p.name AS planName, p.max_taxpayers AS maxTaxpayers, p.quota_per_seat AS quotaPerSeat
         FROM accountant_profiles ap
         JOIN subscriptions s ON s.user_id = ap.user_id AND s.status IN ('active', 'trialing', 'past_due')
         JOIN subscription_plans p ON p.id = s.plan_id
        WHERE ap.id = ?
        LIMIT 1`,
      [accountantProfileId],
    );
    if (!rows.length) return null;
    return {
      planName: rows[0].planName,
      maxTaxpayers: Number(rows[0].maxTaxpayers),
      quotaPerSeat: Number(rows[0].quotaPerSeat),
    };
  }

  /**
   * Dolu koltuk sayısı. Kendi ücretli aboneliği olan mükellefler SAYILMAZ (kural 1).
   * `excludeTaxpayerId` yeni bir yetki verilirken o mükellefi sayımdan çıkarmak için —
   * aynı mükellef için ikinci kez sayılmasın.
   */
  async usedSeats(
    accountantProfileId: string, excludeTaxpayerId?: string, manager?: EntityManager,
  ): Promise<number> {
    const tx = manager ?? this.dataSource.manager;
    const rows: Array<{ c: number }> = await tx.query(
      `SELECT COUNT(*) AS c
         FROM accountant_authorizations a
         JOIN taxpayer_profiles t ON t.id = a.taxpayer_id
        WHERE a.accountant_id = ?
          AND a.status = ?
          AND (? IS NULL OR a.taxpayer_id <> ?)
          AND NOT EXISTS (
                SELECT 1 FROM subscriptions s
                  JOIN subscription_plans p ON p.id = s.plan_id
                 WHERE s.user_id = t.user_id
                   AND s.status IN ('active', 'trialing', 'past_due')
                   AND p.price_yearly > 0
              )`,
      [accountantProfileId, AuthorizationStatus.ACTIVE, excludeTaxpayerId ?? null, excludeTaxpayerId ?? null],
    );
    return Number(rows[0].c);
  }

  async usage(accountantProfileId: string): Promise<SeatUsage> {
    const plan = await this.planFor(accountantProfileId);
    const used = await this.usedSeats(accountantProfileId);
    const available = !plan || plan.maxTaxpayers === 0 ? null : Math.max(0, plan.maxTaxpayers - used);
    return { plan, used, available };
  }

  /** Yeni bir mükellef yetkisi verilmeden önce koltuk var mı diye bakar. */
  async assertSeatAvailable(
    accountantProfileId: string, taxpayerId: string, manager?: EntityManager,
  ): Promise<void> {
    if (!this.enforcing) return;
    const plan = await this.planFor(accountantProfileId, manager);
    if (!plan) {
      throw new ForbiddenException(
        'Mükellef ekleyebilmek için aktif bir ofis paketiniz olmalı.',
      );
    }
    if (plan.maxTaxpayers === 0) return; // sınırsız
    const used = await this.usedSeats(accountantProfileId, taxpayerId, manager);
    if (used >= plan.maxTaxpayers) {
      throw new ForbiddenException(
        `${plan.planName} paketindeki ${plan.maxTaxpayers} mükellef koltuğunun tamamı dolu. `
        + 'Yeni mükellef eklemek için paketinizi yükseltin.',
      );
    }
  }

  /**
   * Yetki aktifleşince mükellefe koltuk kotasını yazar. Yetki değişikliğiyle AYNI tx'te
   * çağrılmalı: yetki ve kota ayrışırsa mükellef ya bedava hak kazanır ya da hakkını
   * kaybeder.
   */
  async applySeat(
    taxpayerId: string, accountantProfileId: string, manager?: EntityManager,
  ): Promise<void> {
    const plan = await this.planFor(accountantProfileId, manager);
    const seatQuota = plan?.quotaPerSeat ?? 0;
    if (seatQuota <= 0) return;
    await this.quota.setAccountantQuota(
      taxpayerId, seatQuota, `Müşavir koltuğu: ${plan?.planName ?? '-'}`, manager,
    );
  }

  /**
   * Yetki kalkınca koltuk kotasını geri alır. Evrak SİLİNMEZ — mükellef kendi planı
   * yoksa arşiv moduna düşer (salt okunur: görüntüleme, indirme, dışa aktarma açık).
   */
  async releaseSeat(taxpayerId: string, manager?: EntityManager): Promise<void> {
    await this.quota.setAccountantQuota(taxpayerId, 0, 'Müşavir yetkisi kaldırıldı', manager);
  }

  /**
   * Müşavirin planı değiştiğinde (yükseltme/düşürme/bitiş) tüm aktif mükelleflerinin
   * koltuk kotasını yeniden yazar. Aksi hâlde eski planın tavanı mükelleflerde asılı
   * kalırdı — düşürmede bedava hak, yükseltmede eksik hak olurdu.
   */
  async reapplyAll(accountantUserId: string): Promise<void> {
    const rows: Array<{ id: string; taxpayerId: string }> = await this.dataSource.query(
      `SELECT ap.id AS id, a.taxpayer_id AS taxpayerId
         FROM accountant_profiles ap
         JOIN accountant_authorizations a ON a.accountant_id = ap.id AND a.status = ?
        WHERE ap.user_id = ?`,
      [AuthorizationStatus.ACTIVE, accountantUserId],
    );
    if (!rows.length) return;
    const plan = await this.planFor(rows[0].id);
    const seatQuota = plan?.quotaPerSeat ?? 0;
    for (const row of rows) {
      await this.quota.setAccountantQuota(
        row.taxpayerId, seatQuota,
        seatQuota > 0 ? `Müşavir planı güncellendi: ${plan?.planName}` : 'Müşavir planı sona erdi',
      );
    }
    this.logger.log(`Koltuk kotası yenilendi: müşavir=${accountantUserId} mükellef=${rows.length} tavan=${seatQuota}`);
  }
}
