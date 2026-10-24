import {
  BadRequestException, ConflictException, Inject, Injectable, Logger,
  NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, Repository } from 'typeorm';
import {
  Payment, QuotaPackage, Subscription, SubscriptionPlan, TaxpayerProfile, User,
} from '../../database/entities';
import { PaymentKind, PaymentStatus } from '../../database/entities/payment.entity';
import { PlanAudience } from '../../database/entities/subscription-plan.entity';
import {
  BillingPeriod, LIVE_SUBSCRIPTION_STATUSES, SubscriptionStatus,
} from '../../database/entities/subscription.entity';
import { QuotaService } from '../quota/quota.service';
import { AiCreditsService } from '../ai-credits/ai-credits.service';
import { AdminAuditAction, AiCreditReason, QuotaReason, Role } from '../../shared/enums';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider';
import { SeatsService } from '../seats/seats.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { formatDateTr } from '../../shared/format-date';
import { AuditService } from '../audit/audit.service';

/** Yenileme hatırlatma eşikleri, geniş → dar. */
const RENEWAL_REMINDER_DAYS = [30, 7, 1] as const;
export const RENEWAL_REMINDER_TYPE = 'subscription_renewal';

export interface Entitlements {
  planCode: string | null;
  planName: string | null;
  status: SubscriptionStatus | null;
  periodEnd: string | null;
  /** 0 = sınırsız (ya da plan yok). */
  maxTaxpayers: number;
  includedQuota: number;
  includedAiCredits: number;
  /** Müşavir planlarında bir koltuğun (mükellefin) evrak tavanı; mükellef planlarında 0. */
  quotaPerSeat: number;
  /** Yalnızca müşavirde dolu: kaç koltuk kullanılıyor ve kaç tane kaldı (null = sınırsız). */
  seatsUsed?: number;
  seatsAvailable?: number | null;
  /** Abonelik yoksa/bittiyse false — arayüz yükseltme çağrısı gösterir. */
  active: boolean;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(SubscriptionPlan) private readonly plans: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(QuotaPackage) private readonly packages: Repository<QuotaPackage>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(TaxpayerProfile) private readonly taxpayers: Repository<TaxpayerProfile>,
    private readonly quota: QuotaService,
    private readonly aiCredits: AiCreditsService,
    private readonly config: ConfigService,
    private readonly seats: SeatsService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // ---------------------------------------------------------------- planlar

  async listPlans(audience?: PlanAudience, includeHidden = false): Promise<SubscriptionPlan[]> {
    const qb = this.plans.createQueryBuilder('p').where('p.isActive = 1');
    if (audience) qb.andWhere('p.audience = :audience', { audience });
    if (!includeHidden) qb.andWhere('p.isPublic = 1');
    return qb.orderBy('p.audience', 'ASC').addOrderBy('p.sortOrder', 'ASC').getMany();
  }

  async listPackages(): Promise<QuotaPackage[]> {
    return this.packages.find({ where: { isActive: 1 }, order: { sortOrder: 'ASC' } });
  }

  // ------------------------------------------------------------ abonelikler

  /** Kullanıcının yürürlükteki aboneliği (varsa) — plan ilişkisiyle birlikte (okuma için). */
  async currentSubscription(userId: string): Promise<Subscription | null> {
    return this.subs.findOne({
      where: { userId, status: In(LIVE_SUBSCRIPTION_STATUSES) },
      relations: { plan: true },
    });
  }

  /**
   * Aynı sorgu ama İLİŞKİSİZ — plan DEĞİŞTİRİLECEĞİ zaman bu kullanılır.
   *
   * TypeORM tuzağı: `plan` ilişkisi yüklenmiş bir varlıkta `planId` alanını değiştirip
   * save() çağırmak İŞE YARAMAZ; ilişki nesnesi FK kolonunu ezer ve satıra ESKİ plan
   * yazılır. Sonuç sessizdi: kota ve AI kredisi doğru planla uygulanıyor ama
   * `subscriptions.plan_id` ilk plana çakılı kalıyordu — "Aboneliğim" ekranı ve
   * koltuk hesabı yanlış planı gösteriyordu.
   */
  private async currentSubscriptionForUpdate(userId: string): Promise<Subscription | null> {
    return this.subs.findOne({ where: { userId, status: In(LIVE_SUBSCRIPTION_STATUSES) } });
  }

  /**
   * Kullanıcının o anki hakları. Sanal POS henüz yokken çoğu hesabın aboneliği
   * olmayacağı için burada "abonelik yoksa engelle" DENMEZ — yalnızca durum raporlanır;
   * kısıtlamayı uygulamak (ör. mükellef sayısı sınırı) ayrı bir karardır ve ticari
   * açılışta devreye alınır.
   */
  async entitlements(userId: string): Promise<Entitlements> {
    const user = await this.users.findOne({ where: { id: userId } });
    const seats = user?.role === Role.ACCOUNTANT ? await this.seatUsageFor(userId) : null;
    const sub = await this.currentSubscription(userId);
    if (!sub?.plan) {
      return {
        planCode: null, planName: null, status: null, periodEnd: null,
        maxTaxpayers: 0, includedQuota: 0, includedAiCredits: 0, quotaPerSeat: 0,
        ...(seats ?? {}), active: false,
      };
    }
    return {
      planCode: sub.plan.code,
      planName: sub.plan.name,
      status: sub.status,
      periodEnd: sub.currentPeriodEnd.toISOString(),
      maxTaxpayers: sub.plan.maxTaxpayers,
      includedQuota: Number(sub.plan.includedQuota),
      includedAiCredits: Number(sub.plan.includedAiCredits),
      quotaPerSeat: Number(sub.plan.quotaPerSeat),
      ...(seats ?? {}),
      active: sub.status !== SubscriptionStatus.CANCELED && sub.status !== SubscriptionStatus.EXPIRED,
    };
  }

  /** Müşavirin dolu/boş koltuk sayısı — "kaç mükellef ekleyebilirim" sorusunun cevabı. */
  private async seatUsageFor(userId: string): Promise<{ seatsUsed: number; seatsAvailable: number | null }> {
    const rows: Array<{ id: string }> = await this.subs.manager.query(
      'SELECT id FROM accountant_profiles WHERE user_id = ? LIMIT 1', [userId],
    );
    if (!rows.length) return { seatsUsed: 0, seatsAvailable: null };
    const usage = await this.seats.usage(rows[0].id);
    return { seatsUsed: usage.used, seatsAvailable: usage.available };
  }

  /**
   * Dönem sonu. Tüm planlar yıllık — aylık faturalama
   * kaldırıldı; eski aylık abonelikler migration'da yıllığa çekildi. Enum'daki `monthly`
   * geçmiş kayıtlar için duruyor, yeni satın almalarda kabul edilmiyor.
   */
  private periodEnd(from: Date, period: BillingPeriod): Date {
    const d = new Date(from);
    if (period === BillingPeriod.MONTHLY) d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  /**
   * Aboneliği başlatır/yeniler ve plana dahil kota + AI kredisini yükler.
   *
   * Ödeme tarafından (webhook/callback) ve admin'in elle atamasından çağrılır — tek
   * yol olması, "ödeme geldi ama hak verilmedi" ayrışmasını önler.
   */
  async activateSubscription(
    userId: string, planId: number, period: BillingPeriod, opts: { trial?: boolean; note?: string } = {},
  ): Promise<Subscription> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan bulunamadı.');

    const expectedAudience = user.role === Role.ACCOUNTANT ? PlanAudience.ACCOUNTANT : PlanAudience.TAXPAYER;
    if (plan.audience !== expectedAudience) {
      throw new BadRequestException('Bu plan bu kullanıcı türü için satılmıyor.');
    }

    const now = new Date();
    const existing = await this.currentSubscriptionForUpdate(userId);
    // Aynı planın uzatılması "yenileme"dir; farklı plana geçiş yeni haklar demektir.
    const isRenewal = existing?.planId === plan.id;
    // Yürürlükteki abonelik varsa yeni satır AÇILMAZ — DB'deki `active_lock` UNIQUE
    // indeksi buna zaten izin vermez; plan değişikliği mevcut satır üzerinden yapılır.
    const sub = existing ?? this.subs.create({ userId });
    sub.planId = plan.id;
    sub.billingPeriod = period;
    sub.status = opts.trial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE;
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd = opts.trial && plan.trialDays > 0
      ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
      : this.periodEnd(now, period);
    sub.cancelAtPeriodEnd = 0;
    sub.canceledAt = null;
    // Yeni dönem = yeni hatırlatma serisi; eski dönemin izi kalırsa 30/7/1
    // hatırlatmaları bir daha hiç gönderilmez.
    sub.renewalReminderDays = null;
    if (opts.note) sub.note = opts.note;
    const saved = await this.subs.save(sub);

    await this.applyPlanAllowances(user, plan, isRenewal);
    return saved;
  }

  /**
   * Plana dahil hakları uygular. İki kaynak bilinçli olarak FARKLI davranır:
   *
   *  - Evrak kotası bir STOK'tur (duran evrak sayısı). Plan tavanın payını BELİRLER,
   *    eklemez; aynı planın yenilenmesi tavanı büyütmez (bkz. QuotaService.setPlanQuota).
   *    Müşavir planlarında evrak kotası yoktur — müşavirin mükellef profili yoktur,
   *    dilerse mükellefi adına ek kota paketi alır.
   *  - AI kredisi bir AKIŞ'tır (her çağrıda tükenir). Her abonelik döneminde yeniden
   *    yüklenir; aksi hâlde ikinci yılda yapay zeka özellikleri sessizce çalışmaz olurdu.
   */
  private async applyPlanAllowances(user: User, plan: SubscriptionPlan, isRenewal: boolean): Promise<void> {
    if (user.role === Role.TAXPAYER) {
      const tp = await this.taxpayers.findOne({ where: { userId: user.id } });
      if (tp) await this.quota.setPlanQuota(tp.id, Number(plan.includedQuota), `Abonelik: ${plan.name}`);
    }
    if (user.role === Role.ACCOUNTANT) {
      // Müşavirin planı değiştiğinde koltuk tavanı TÜM mükelleflerinde yenilenmeli;
      // aksi hâlde düşürmede eski (cömert) tavan asılı kalır, yükseltmede yeni hak
      // mükelleflere hiç ulaşmazdı.
      await this.seats.reapplyAll(user.id);
    }
    const aiAmount = Number(plan.includedAiCredits);
    if (aiAmount > 0) {
      await this.aiCredits.grant(
        user.id, aiAmount, AiCreditReason.ADMIN_GRANT,
        isRenewal ? `Abonelik yenileme: ${plan.name}` : `Abonelik: ${plan.name}`,
      );
    }
  }

  async cancelSubscription(userId: string, immediately = false): Promise<Subscription> {
    const sub = await this.currentSubscriptionForUpdate(userId);
    if (!sub) throw new NotFoundException('Aktif abonelik bulunamadı.');
    if (!immediately) {
      // Dönem sonunda biter — kullanıcı ödediği süreyi kullanmaya devam eder,
      // koltukları da dönem sonuna kadar durur (bkz. expireSubscriptions).
      sub.cancelAtPeriodEnd = 1;
      return this.subs.save(sub);
    }

    sub.status = SubscriptionStatus.CANCELED;
    sub.canceledAt = new Date();
    const saved = await this.subs.save(sub);
    // Anında iptalde koltuklar hemen boşalır: mükellefler arşiv moduna düşer,
    // evrakları silinmez.
    await this.seats.reapplyAll(userId);
    return saved;
  }

  /**
   * Dönem bitimine 30 / 7 / 1 gün kala hatırlatır.
   *
   * Otomatik yenileme YOK (Shopier api_pay4 akışında abonelik yok, tek çekim var):
   * haber verilmezse kullanıcı erişimini sessizce kaybeder, üstelik bunu genellikle
   * beyanname döneminde evrak yüklemek isterken fark eder. Bu yüzden bildirim
   * hizmetin işleyişine ilişkin ZORUNLU iletidir; tanıtım iznine bakılmaz.
   *
   * Günde bir kez, sabah 09:00'da. Gece yarısı yerine mesai başlangıcı: e-posta
   * gece gelirse sabahki yığının altında kalıyor.
   */
  @Cron('0 0 9 * * *')
  async sendRenewalReminders(): Promise<void> {
    const now = new Date();
    const ufuk = new Date(now.getTime() + RENEWAL_REMINDER_DAYS[0] * 86_400_000);
    const yaklasan = await this.subs.find({
      where: { status: In(LIVE_SUBSCRIPTION_STATUSES), currentPeriodEnd: Between(now, ufuk) },
      take: 500,
    });

    for (const sub of yaklasan) {
      const kalanGun = Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / 86_400_000);
      // Aşılan eşiklerin EN DARI: 25 gün kala 30, 5 gün kala 7, son gün 1.
      const esik = [...RENEWAL_REMINDER_DAYS].reverse().find((d) => kalanGun <= d);
      if (!esik) continue;
      // Aynı eşik ikinci kez gönderilmesin; daha dar eşiğe geçince yeniden gönderilir.
      if (sub.renewalReminderDays !== null && sub.renewalReminderDays !== undefined
          && sub.renewalReminderDays <= esik) continue;

      try {
        const plan = sub.planId ? await this.plans.findOne({ where: { id: sub.planId } }) : null;
        const planAdi = plan?.name ?? 'Aboneliğiniz';
        const bitis = formatDateTr(sub.currentPeriodEnd);

        await this.notifications.create({
          userId: sub.userId,
          type: RENEWAL_REMINDER_TYPE,
          title: kalanGun <= 1 ? 'Aboneliğiniz yarın sona eriyor' : `Aboneliğiniz ${kalanGun} gün sonra sona eriyor`,
          body: `${planAdi} aboneliğiniz ${bitis} tarihinde bitiyor. Otomatik yenileme yapılmaz.`,
          metadata: { subscriptionId: sub.id, daysLeft: kalanGun },
        });

        const user = await this.users.findOne({ where: { id: sub.userId } });
        if (user?.email) {
          const appUrl = this.config.get<string>('APP_URL') ?? '';
          await this.mail.sendSubscriptionRenewalReminder(
            user.email, user.fullName ?? '', planAdi, sub.currentPeriodEnd, kalanGun,
            `${appUrl}/abonelik`,
          );
        }

        sub.renewalReminderDays = esik;
        await this.subs.save(sub);
      } catch (err) {
        // Tek kullanıcıda patlayan e-posta, kalan hatırlatmaları düşürmesin.
        this.logger.error(`Yenileme hatırlatması gönderilemedi (sub=${sub.id}): ${(err as Error).message}`);
      }
    }
  }

  /**
   * Süresi dolmuş abonelikleri kapatır. Sağlayıcı entegrasyonu geldiğinde burası
   * "otomatik yenileme denemesi" ile genişletilecek; şimdilik yalnızca durumu düşürür.
   */
  @Cron('0 5 * * * *')
  async expireSubscriptions(): Promise<void> {
    const due = await this.subs.find({
      where: { status: In(LIVE_SUBSCRIPTION_STATUSES), currentPeriodEnd: LessThan(new Date()) },
      take: 500,
    });
    for (const sub of due) {
      sub.status = sub.cancelAtPeriodEnd ? SubscriptionStatus.CANCELED : SubscriptionStatus.PAST_DUE;
      if (sub.status === SubscriptionStatus.CANCELED) sub.canceledAt = new Date();
      await this.subs.save(sub);
      // `past_due` hâlâ yürürlükte sayılır (ödeme hatırlatma penceresi); yalnızca
      // gerçekten iptal olduğunda koltuklar boşalır ve mükellefler arşiv moduna düşer.
      if (sub.status === SubscriptionStatus.CANCELED) await this.seats.reapplyAll(sub.userId);
      this.logger.log(`Abonelik dönemi bitti: user=${sub.userId} durum=${sub.status}`);
    }
  }

  // ---------------------------------------------------------------- ödemeler

  /** Ödeme akışı gerçekten kullanılabilir mi (sağlayıcı seçili ve yapılandırılmış mı). */
  paymentsEnabled(): boolean {
    if (!this.provider.isConfigured()) return false;
    // mock sağlayıcı üretimde kapalı: gerçek para hareketi olmadan "ödendi" üretmesin.
    if (this.provider.name === 'mock' && this.config.get('NODE_ENV') === 'production') return false;
    return true;
  }

  private assertPaymentsEnabled(): void {
    if (!this.paymentsEnabled()) {
      throw new ServiceUnavailableException(
        'Çevrim içi ödeme henüz etkin değil. Plan yükseltmesi için lütfen bizimle iletişime geçin.',
      );
    }
  }

  /** Abonelik satın alma başlatır — ödeme kaydı açar ve sağlayıcı oturumu döner. */
  async startSubscriptionCheckout(userId: string, planId: number, period: BillingPeriod, ip?: string) {
    this.assertPaymentsEnabled();
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    const plan = await this.plans.findOne({ where: { id: planId, isActive: 1 } });
    if (!plan) throw new NotFoundException('Plan bulunamadı.');

    // Tüm planlar yıllık; tutar her zaman yıllık fiyattır.
    const amount = plan.priceYearly;
    const payment = await this.payments.save(this.payments.create({
      userId,
      kind: PaymentKind.SUBSCRIPTION,
      amount,
      currency: plan.currency,
      description: `${plan.name} (yıllık)`,
      provider: this.provider.name,
      status: PaymentStatus.PENDING,
      // Sağlayıcı dönüşünde hangi planın alındığını bilmek için saklanır.
      providerPayload: { planId: plan.id, billingPeriod: period },
    }));

    const session = await this.provider.createCheckout({
      paymentId: payment.id,
      amount,
      currency: plan.currency,
      description: `Maliyetik ${plan.name}`,
      buyer: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        ip,
      },
      returnUrl: `${this.config.get('APP_URL')}/odeme/sonuc`,
    });

    payment.providerRef = session.providerRef;
    await this.payments.save(payment);
    return { paymentId: payment.id, ...session };
  }

  /** Kota paketi satın alma başlatır (mükellef veya onun adına müşavir). */
  async startPackageCheckout(userId: string, taxpayerId: string, packageId: number, ip?: string) {
    this.assertPaymentsEnabled();
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    const pkg = await this.packages.findOne({ where: { id: packageId, isActive: 1 } });
    if (!pkg) throw new NotFoundException('Paket bulunamadı.');
    const taxpayer = await this.taxpayers.findOne({ where: { id: taxpayerId } });
    if (!taxpayer) throw new NotFoundException('Mükellef bulunamadı.');

    const payment = await this.payments.save(this.payments.create({
      userId,
      taxpayerId,
      packageId: pkg.id,
      kind: PaymentKind.QUOTA_PACKAGE,
      amount: pkg.price,
      currency: pkg.currency,
      quotaGranted: pkg.quotaAmount,
      description: pkg.name,
      provider: this.provider.name,
      status: PaymentStatus.PENDING,
    }));

    const session = await this.provider.createCheckout({
      paymentId: payment.id,
      amount: pkg.price,
      currency: pkg.currency,
      description: `Maliyetik ${pkg.name}`,
      buyer: { id: user.id, name: user.fullName, email: user.email, ip },
      returnUrl: `${this.config.get('APP_URL')}/odeme/sonuc`,
    });

    payment.providerRef = session.providerRef;
    await this.payments.save(payment);
    return { paymentId: payment.id, ...session };
  }

  /**
   * Sağlayıcıdan dönen sonucu işler ve hakları verir.
   *
   * Güvenlik: sonuç DAİMA sağlayıcının doğruladığı veriden okunur (`provider.verifyCallback`
   * / `verifyWebhook`), tarayıcının gönderdiği alanlardan değil. Tutar bizdeki kayıtla
   * karşılaştırılır — eksik tutarla "ödendi" işaretlenmesi engellenir.
   *
   * Yeniden çağrılabilir (idempotent): zaten `paid` olan bir ödeme ikinci kez hak vermez;
   * sağlayıcılar aynı webhook'u birden çok kez gönderebilir.
   */
  async finalizePayment(result: Awaited<ReturnType<PaymentProvider['verifyCallback']>>): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { id: result.paymentId } });
    if (!payment) throw new NotFoundException('Ödeme kaydı bulunamadı.');
    if (payment.status === PaymentStatus.PAID) return payment;

    if (!result.success) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = result.failureReason?.slice(0, 255) ?? 'Ödeme başarısız.';
      payment.providerPayload = { ...(payment.providerPayload ?? {}), callback: result.raw };
      return this.payments.save(payment);
    }

    if (result.amount != null && Number(result.amount) !== Number(payment.amount)) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = `Tutar uyuşmuyor (beklenen ${payment.amount}, gelen ${result.amount}).`;
      await this.payments.save(payment);
      throw new ConflictException('Ödeme tutarı uyuşmuyor.');
    }

    payment.status = PaymentStatus.PAID;
    payment.paidAt = new Date();
    payment.providerRef = result.providerRef || payment.providerRef;
    payment.providerPayload = { ...(payment.providerPayload ?? {}), callback: result.raw };
    await this.payments.save(payment);

    if (payment.kind === PaymentKind.SUBSCRIPTION && payment.userId) {
      const meta = payment.providerPayload as { planId?: number; billingPeriod?: BillingPeriod } | null;
      if (meta?.planId) {
        const sub = await this.activateSubscription(
          payment.userId, meta.planId, meta.billingPeriod ?? BillingPeriod.MONTHLY,
        );
        payment.subscriptionId = sub.id;
        await this.payments.save(payment);
      }
    } else if (payment.kind === PaymentKind.QUOTA_PACKAGE && payment.taxpayerId) {
      await this.quota.grant(
        payment.taxpayerId, Number(payment.quotaGranted), QuotaReason.PURCHASE,
        payment.description ?? 'Kota paketi',
      );
    } else if (payment.kind === PaymentKind.AI_CREDITS && payment.userId) {
      await this.aiCredits.grant(
        payment.userId, Number(payment.aiCreditsGranted), AiCreditReason.ADMIN_GRANT,
        payment.description ?? 'AI kredi paketi',
      );
    }

    return payment;
  }

  // ------------------------------------------------------------ mutabakat

  /**
   * Ödeme mutabakatı listesi.
   *
   * Shopier'in api_pay4 akışında sunucu-sunucu webhook YOK: tek kaynak, kullanıcının
   * tarayıcısıyla dönen callback. Kullanıcı ödeme sonrası sekmeyi kapatırsa para
   * çekilmiş olduğu hâlde bizde kayıt `pending` kalır ve kimse fark etmez. Bu liste,
   * Shopier panosuyla elle karşılaştırmak için var.
   */
  async listPayments(status: PaymentStatus | undefined, limit: number): Promise<Array<Record<string, unknown>>> {
    const qb = this.payments.createQueryBuilder('p')
      .leftJoin(User, 'u', 'u.id = p.userId')
      .select([
        'p.id AS id', 'p.uuid AS uuid', 'p.kind AS kind', 'p.amount AS amount',
        'p.currency AS currency', 'p.status AS status', 'p.provider AS provider',
        'p.providerRef AS providerRef', 'p.description AS description',
        'p.failureReason AS failureReason', 'p.paidAt AS paidAt', 'p.createdAt AS createdAt',
        'u.email AS userEmail', 'u.full_name AS userName',
      ])
      .orderBy('p.createdAt', 'DESC')
      .limit(Math.min(Math.max(limit, 1), 500));
    if (status) qb.where('p.status = :status', { status });
    return qb.getRawMany();
  }

  /**
   * Ödemeyi elle "ödendi" işaretler ve haklarını verir.
   *
   * Kasten `finalizePayment` üzerinden geçer: hak verme, abonelik aktivasyonu ve
   * idempotenslik tek yerde kalsın — callback ile elle mutabakat farklı davranırsa
   * en zor bulunan hata sınıfı doğar.
   *
   * `amount` BİLEREK gönderilmez: Shopier dönüş imzası tutarı kapsamadığı için tutar
   * zaten kendi kaydımızdan doğrulanıyor; buraya tutar geçmek yalnızca sahte bir
   * doğrulama hissi verirdi. Admin, Shopier panosundaki tutarı gözüyle karşılaştırır.
   */
  async reconcilePayment(paymentId: string, adminUserId: string, providerRef?: string, note?: string): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Ödeme kaydı bulunamadı.');
    if (payment.status === PaymentStatus.PAID) {
      throw new ConflictException('Bu ödeme zaten ödendi olarak işaretli.');
    }

    const sonuc = await this.finalizePayment({
      paymentId: payment.id,
      success: true,
      providerRef: providerRef || payment.providerRef || undefined,
      raw: { manuel: true, adminUserId, note: note ?? null, tarih: new Date().toISOString() },
    } as Awaited<ReturnType<PaymentProvider['verifyCallback']>>);

    await this.audit.log({
      actorUserId: adminUserId,
      action: AdminAuditAction.PAYMENT_RECONCILED,
      entityType: 'payment',
      entityId: payment.id,
      metadata: { amount: payment.amount, kind: payment.kind, providerRef, note },
    });
    this.logger.log(`Ödeme elle mutabakat edildi: payment=${payment.id} admin=${adminUserId}`);
    return sonuc;
  }

  /** Karşılığı bulunamayan ödemeyi başarısız işaretler — liste şişmesin, iz kalsın. */
  async markPaymentFailed(paymentId: string, adminUserId: string, reason: string): Promise<Payment> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Ödeme kaydı bulunamadı.');
    if (payment.status === PaymentStatus.PAID) {
      throw new ConflictException('Ödenmiş bir kayıt başarısız işaretlenemez; iade süreci ayrıdır.');
    }
    payment.status = PaymentStatus.FAILED;
    payment.failureReason = reason.slice(0, 255);
    const saved = await this.payments.save(payment);

    await this.audit.log({
      actorUserId: adminUserId,
      action: AdminAuditAction.PAYMENT_MARKED_FAILED,
      entityType: 'payment',
      entityId: payment.id,
      metadata: { reason },
    });
    return saved;
  }

  /** Admin plan düzenlemesi — `code` ve `audience` bilerek değiştirilemez (ödeme
   *  sağlayıcısındaki ürün eşlemesi ve satılmış aboneliklerin anlamı bozulmasın). */
  async updatePlan(id: number, patch: Record<string, unknown>): Promise<SubscriptionPlan> {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan bulunamadı.');
    const assign = <K extends keyof SubscriptionPlan>(key: K, value: SubscriptionPlan[K] | undefined) => {
      if (value !== undefined) plan[key] = value;
    };
    assign('name', patch.name as string);
    assign('description', patch.description as string);
    assign('priceMonthly', patch.priceMonthly as string);
    assign('priceYearly', patch.priceYearly as string);
    if (patch.includedQuota !== undefined) plan.includedQuota = String(patch.includedQuota);
    if (patch.includedAiCredits !== undefined) plan.includedAiCredits = String(patch.includedAiCredits);
    assign('maxTaxpayers', patch.maxTaxpayers as number);
    assign('trialDays', patch.trialDays as number);
    if (patch.isActive !== undefined) plan.isActive = patch.isActive ? 1 : 0;
    if (patch.isPublic !== undefined) plan.isPublic = patch.isPublic ? 1 : 0;
    assign('sortOrder', patch.sortOrder as number);
    return this.plans.save(plan);
  }

  async myPayments(userId: string): Promise<Payment[]> {
    return this.payments.find({ where: { userId }, order: { id: 'DESC' }, take: 50 });
  }
}
