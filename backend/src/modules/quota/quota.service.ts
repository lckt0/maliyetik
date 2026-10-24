import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { QuotaLedger, TaxpayerProfile } from '../../database/entities';
import { QuotaReason } from '../../shared/enums';
import { Cursor, Paginated } from '../../common/pagination/paginated';
import {
  lockTaxpayerForUpdate,
  lockTaxpayersForUpdate,
} from '../../common/utils/row-locks';

export interface QuotaTaxpayerSearchResult {
  taxpayerProfileId: string;
  companyTitle: string;
  vknTckn: string;
  quotaLimit: number;
  quotaUsed: number;
}

export interface QuotaSummary {
  limit: number;
  used: number;
  /** Kalan hak — negatif olmaz; aşım `overage` alanında raporlanır. */
  remaining: number;
  /** Tavanın üstünde duran evrak sayısı (arşiv modunda > 0 olabilir). */
  overage: number;
  fromPlan: number;
  fromAccountant: number;
  purchased: number;
  /** Hiçbir kaynaktan hak gelmiyor ama duran evrak var — salt okunur arşiv. */
  archived: boolean;
}

export interface QuotaLedgerEntry {
  id: string;
  changeAmount: number;
  balanceAfter: number;
  reason: QuotaReason;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt: Date;
}

/**
 * Kota muhasebesi. `taxpayer_profiles.quota_limit/quota_used` denormalize
 * sayaçları hızlı okuma için; her değişiklik `quota_ledger`'a yazılır (audit).
 * Tüketim, satır kilidiyle (FOR UPDATE) yarış koşulsuz atomiktir.
 *
 * **Değişmez kural:** `quota_used`, mükellefin sistemde DURAN evrak sayısıdır —
 * aktif evraklar + çöp kutusundakiler (şirket evrakları hariç; onlar kota tüketmez).
 * Yani:
 *   - yükleme            → `consume` (kota düşer)
 *   - çöp kutusuna atma  → değişmez (evrak hâlâ duruyor, geri yüklenebilir)
 *   - geri yükleme       → değişmez
 *   - KALICI silme       → `refund` (kota iade edilir, evrak artık yok)
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Kota sayacına dokunacak tx'lerde mükellef satırını peşinen X kilidine alır.
   * Gerekçesi ve deadlock ayrıntısı için bkz. `common/utils/row-locks.ts`.
   */
  async lockTaxpayerForUpdate(taxpayerId: string, tx: EntityManager): Promise<void> {
    await lockTaxpayerForUpdate(tx, taxpayerId);
  }

  /** Toplu işlemler için — mükellefleri sabit sırada kilitler (bkz. row-locks.ts). */
  async lockTaxpayersForUpdate(taxpayerIds: string[], tx: EntityManager): Promise<void> {
    await lockTaxpayersForUpdate(tx, taxpayerIds);
  }

  /**
   * Kota düşer (varsayılan 1). Aynı tx içinde bir evrak insert'i ile birlikte
   * çağrılabilmesi için opsiyonel `manager` alır.
   *
   * DİKKAT: Bir evrak INSERT'i ile aynı tx'te kullanılıyorsa, tx'in başında
   * `lockTaxpayerForUpdate` çağrılmalıdır — aksi hâlde FK'nin aldığı S kilidi
   * yüzünden eşzamanlı yüklemeler deadlock üretir.
   */
  async consume(
    taxpayerId: string,
    amount = 1,
    referenceId?: string,
    manager?: EntityManager,
  ): Promise<{ remaining: number }> {
    const run = async (tx: EntityManager) => {
      const tp = await tx
        .createQueryBuilder(TaxpayerProfile, 't')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: taxpayerId })
        .getOne();
      if (!tp) throw new NotFoundException('Mükellef bulunamadı.');

      const limit = Number(tp.quotaLimit);
      const used = Number(tp.quotaUsed);
      if (used + amount > limit) {
        throw new ForbiddenException('Yükleme kotanız dolmuş. Lütfen kota satın alın.');
      }

      const newUsed = used + amount;
      await tx.update(TaxpayerProfile, { id: taxpayerId }, { quotaUsed: String(newUsed) });
      await tx.save(
        tx.create(QuotaLedger, {
          taxpayerId,
          changeAmount: String(-amount),
          balanceAfter: String(limit - newUsed),
          reason: QuotaReason.CONSUME,
          referenceType: referenceId ? 'document' : undefined,
          referenceId,
        }),
      );
      return { remaining: limit - newUsed };
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Kota var mı diye ÖN KONTROL — kilit almaz, yazma yapmaz.
   *
   * Asıl karar hâlâ `consume` içinde, satır kilidi altında verilir (yarış koşulu orada
   * kapanır). Bu kontrol yalnızca pahalı işi boşa yapmamak için: yükleme akışında dosya
   * ÖNCE nesne depolamasına gidiyor, kota ise sonra tüketiliyordu. Kotası olmayan bir
   * mükellefin her denemesi buluta yazılıp ardından reddediliyor, yani sahipsiz nesne
   * bırakıyordu. Arşiv moduyla birlikte bu durum istisna değil, normal akış hâline geldi.
   */
  async assertAvailable(taxpayerId: string, amount = 1): Promise<void> {
    const tp = await this.dataSource
      .getRepository(TaxpayerProfile)
      .findOne({ where: { id: taxpayerId } });
    if (!tp) throw new NotFoundException('Mükellef bulunamadı.');
    if (Number(tp.quotaUsed) + amount > Number(tp.quotaLimit)) {
      throw new ForbiddenException('Yükleme kotanız dolmuş. Lütfen kota satın alın.');
    }
  }

  /**
   * Kalıcı silinen evrakların kotasını iade eder — `quota_used` düşer, `quota_limit`
   * DEĞİŞMEZ (tahsis edilen hak aynı kalır, sadece kullanım geri alınır).
   *
   * Yalnızca kalıcı silmede çağrılır: çöp kutusundaki evrak hâlâ sistemde duruyor ve
   * geri yüklenebiliyor, dolayısıyla kotayı işgal etmeye devam etmeli.
   *
   * `quota_used` DB'de UNSIGNED — negatife düşerse yazma hata verir. Geçmişte oluşmuş
   * bir tutarsızlık (ör. sayaç ile gerçek evrak sayısının ayrışması) yüzünden silme
   * işleminin tümden başarısız olmaması için değer 0'da kırpılır ve uyarı loglanır.
   */
  async refund(
    taxpayerId: string,
    amount = 1,
    opts: { referenceId?: string; note?: string; manager?: EntityManager } = {},
  ): Promise<{ remaining: number } | null> {
    if (amount <= 0) return null;

    const run = async (tx: EntityManager) => {
      const tp = await tx
        .createQueryBuilder(TaxpayerProfile, 't')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: taxpayerId })
        .getOne();
      if (!tp) throw new NotFoundException('Mükellef bulunamadı.');

      const limit = Number(tp.quotaLimit);
      const used = Number(tp.quotaUsed);
      const newUsed = Math.max(0, used - amount);
      const applied = used - newUsed;
      if (applied < amount) {
        this.logger.warn(
          `Kota iadesi kırpıldı: mükellef ${taxpayerId}, istenen ${amount}, uygulanan ${applied} ` +
          `(quota_used=${used}). Sayaç gerçek evrak sayısıyla ayrışmış olabilir.`,
        );
      }

      await tx.update(TaxpayerProfile, { id: taxpayerId }, { quotaUsed: String(newUsed) });
      await tx.save(
        tx.create(QuotaLedger, {
          taxpayerId,
          changeAmount: String(applied),
          balanceAfter: String(limit - newUsed),
          reason: QuotaReason.REFUND,
          referenceType: opts.referenceId ? 'document' : undefined,
          referenceId: opts.referenceId,
          note: opts.note,
        }),
      );
      return { remaining: limit - newUsed };
    };

    return opts.manager ? run(opts.manager) : this.dataSource.transaction(run);
  }

  /**
   * Kalıcı kota tahsisi (ek paket satın alma veya admin tahsisi). `quota_purchased`
   * artar; bu pay plan/koltuk değişikliklerinden ETKİLENMEZ — kullanıcı parasını
   * ödediği hakkı plan düşürdüğünde de kaybetmez.
   */
  async grant(taxpayerId: string, amount: number, reason: QuotaReason, note?: string): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      const tp = await this.lockProfile(tx, taxpayerId);
      const purchased = Number(tp.quotaPurchased) + amount;
      await this.writeCeiling(tx, tp, { purchased }, amount, reason, note);
    });
  }

  /**
   * Kota tavanı ÜÇ kaynaktan hesaplanır:
   *
   *     quota_limit = quota_purchased + MAX(quota_from_plan, quota_from_accountant)
   *
   * MAX (toplam değil) bilinçli: bir mükellefin hem kendi ücretli planı hem de
   * müşavirinin koltuğu olabilir. Toplasaydık aynı mükellef için iki kez ödenmiş
   * gibi hak doğardı; MAX ile "hangisi cömertse o geçerli" olur ve müşavir tarafında
   * bu mükellef koltuk saymaz (bkz. SeatsService).
   *
   * TAVAN `quota_used`'A KIRPILMAZ. `used > limit` meşru bir durumdur — ARŞİV MODU:
   * yükleme durur, HİÇBİR EVRAK SİLİNMEZ, görüntüleme/indirme/dışa aktarma açık kalır.
   * (Kırpsaydık, mükellef sonradan evrak sildiğinde kırpılan fark bedava kotaya
   * dönüşürdü — bkz. migration AccountantSeatsAndArchive.)
   */
  private ceilingOf(tp: {
    quotaPurchased: string; quotaFromPlan: string; quotaFromAccountant: string;
  }): number {
    return Number(tp.quotaPurchased)
      + Math.max(Number(tp.quotaFromPlan), Number(tp.quotaFromAccountant));
  }

  private async lockProfile(tx: EntityManager, taxpayerId: string): Promise<TaxpayerProfile> {
    const tp = await tx
      .createQueryBuilder(TaxpayerProfile, 't')
      .setLock('pessimistic_write')
      .where('t.id = :id', { id: taxpayerId })
      .getOne();
    if (!tp) throw new NotFoundException('Mükellef bulunamadı.');
    return tp;
  }

  /** Kaynaklardan birini günceller, tavanı yeniden hesaplar ve deftere yazar. */
  private async writeCeiling(
    tx: EntityManager,
    tp: TaxpayerProfile,
    patch: { purchased?: number; fromPlan?: number; fromAccountant?: number },
    ledgerAmount: number | null,
    reason: QuotaReason,
    note?: string,
  ): Promise<void> {
    const next = {
      quotaPurchased: String(patch.purchased ?? Number(tp.quotaPurchased)),
      quotaFromPlan: String(patch.fromPlan ?? Number(tp.quotaFromPlan)),
      quotaFromAccountant: String(patch.fromAccountant ?? Number(tp.quotaFromAccountant)),
    };
    const newLimit = this.ceilingOf(next);
    const change = ledgerAmount ?? newLimit - Number(tp.quotaLimit);
    if (change === 0 && newLimit === Number(tp.quotaLimit)) return;

    await tx.update(TaxpayerProfile, { id: tp.id }, { ...next, quotaLimit: String(newLimit) });
    await tx.save(
      tx.create(QuotaLedger, {
        taxpayerId: tp.id,
        changeAmount: String(change),
        balanceAfter: String(newLimit - Number(tp.quotaUsed)),
        reason,
        note,
      }),
    );
  }

  /**
   * Mükellefin KENDİ planından gelen kota payını yeni değere çeker — tavanı artırmaz,
   * payı değiştirir. Aynı planın yenilenmesinde fark 0 olur ve kota birikmez.
   */
  async setPlanQuota(taxpayerId: string, planQuota: number, note: string): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      const tp = await this.lockProfile(tx, taxpayerId);
      if (Number(tp.quotaFromPlan) === planQuota) return;
      await this.writeCeiling(tx, tp, { fromPlan: planQuota }, null, QuotaReason.ADJUSTMENT, note);
    });
  }

  /**
   * Müşavir koltuğundan gelen kota payını ayarlar. Yetki verildiğinde müşavirin
   * planındaki koltuk tavanı, yetki kalktığında 0 yazılır.
   *
   * Aynı tx içinde yetki değişikliğiyle birlikte çağrılabilmesi için `manager` alır —
   * yetki ve kota ayrışırsa mükellef ya bedava hak kazanır ya da hakkını kaybeder.
   */
  async setAccountantQuota(
    taxpayerId: string, seatQuota: number, note: string, manager?: EntityManager,
  ): Promise<void> {
    const run = async (tx: EntityManager) => {
      const tp = await this.lockProfile(tx, taxpayerId);
      if (Number(tp.quotaFromAccountant) === seatQuota) return;
      await this.writeCeiling(tx, tp, { fromAccountant: seatQuota }, null, QuotaReason.ADJUSTMENT, note);
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * `remaining` bilerek 0'da kırpılır — negatif bir "kalan" arayüzde anlamsız görünür.
   * Aşım ayrı alanda (`overage`) raporlanır; `archived` ise mükellefin ARŞİV MODUNDA
   * olduğunu söyler: hiçbir kaynaktan hak gelmiyor ama sistemde duran evrakı var.
   * Arşiv modunda görüntüleme/indirme/dışa aktarma açıktır, yalnızca yükleme durur.
   */
  async summary(taxpayerId: string): Promise<QuotaSummary> {
    const tp = await this.dataSource
      .getRepository(TaxpayerProfile)
      .findOne({ where: { id: taxpayerId } });
    if (!tp) throw new NotFoundException('Mükellef bulunamadı.');
    const limit = Number(tp.quotaLimit);
    const used = Number(tp.quotaUsed);
    return {
      limit,
      used,
      remaining: Math.max(0, limit - used),
      overage: Math.max(0, used - limit),
      fromPlan: Number(tp.quotaFromPlan),
      fromAccountant: Number(tp.quotaFromAccountant),
      purchased: Number(tp.quotaPurchased),
      archived: used > 0 && used >= limit
        && Number(tp.quotaFromPlan) === 0 && Number(tp.quotaFromAccountant) === 0,
    };
  }

  /** Admin'in kota tahsis ederken mükellef aramak için kullandığı uç — firma unvanı, VKN veya kullanıcı adı/e-postasına göre. */
  async searchTaxpayers(search: string, limit: number): Promise<QuotaTaxpayerSearchResult[]> {
    const qb = this.dataSource
      .createQueryBuilder(TaxpayerProfile, 't')
      .leftJoin('users', 'u', 'u.id = t.user_id')
      .select([
        't.id AS taxpayerProfileId',
        't.company_title AS companyTitle',
        't.vkn_tckn AS vknTckn',
        't.quota_limit AS quotaLimit',
        't.quota_used AS quotaUsed',
      ])
      .take(limit);

    if (search) {
      qb.andWhere('(t.company_title LIKE :s OR t.vkn_tckn LIKE :s OR u.full_name LIKE :s OR u.email LIKE :s)', {
        s: `%${search}%`,
      });
    }
    qb.orderBy('t.company_title', 'ASC');

    const rows = await qb.getRawMany<{
      taxpayerProfileId: string; companyTitle: string; vknTckn: string; quotaLimit: string; quotaUsed: string;
    }>();
    return rows.map((r) => ({
      taxpayerProfileId: r.taxpayerProfileId,
      companyTitle: r.companyTitle,
      vknTckn: r.vknTckn,
      quotaLimit: Number(r.quotaLimit),
      quotaUsed: Number(r.quotaUsed),
    }));
  }

  /** `quota_ledger` geçmişi — Admin Kota Tahsis sayfasındaki tahsis/tüketim dökümü. */
  async ledgerHistory(taxpayerId: string, cursor: string | undefined, limit: number, page?: number): Promise<Paginated<QuotaLedgerEntry>> {
    const qb = this.dataSource
      .createQueryBuilder(QuotaLedger, 'l')
      .where('l.taxpayerId = :taxpayerId', { taxpayerId });

    let items: QuotaLedger[];
    let nextCursor: string | null = null;
    let extra: { total: number; page: number; totalPages: number } | undefined;

    if (page) {
      const total = await qb.clone().getCount();
      items = await qb.orderBy('l.id', 'DESC').skip((page - 1) * limit).take(limit).getMany();
      extra = { total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
    } else {
      if (cursor) qb.andWhere('l.id < :cid', { cid: Cursor.decode(cursor) });
      qb.orderBy('l.id', 'DESC').take(limit + 1);
      const rows = await qb.getMany();
      const hasMore = rows.length > limit;
      items = hasMore ? rows.slice(0, limit) : rows;
      nextCursor = hasMore ? Cursor.encode(items[items.length - 1].id) : null;
    }

    return {
      items: items.map((r) => ({
        id: r.id,
        changeAmount: Number(r.changeAmount),
        balanceAfter: Number(r.balanceAfter),
        reason: r.reason,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        note: r.note,
        createdAt: r.createdAt,
      })),
      nextCursor,
      limit,
      ...extra,
    };
  }
}
