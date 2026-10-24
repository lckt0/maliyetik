import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountantAuthorization, TaxpayerProfile } from '../../database/entities';
import { AuthorizationStatus } from '../../shared/enums';
import { lockTaxpayerForUpdate } from '../../common/utils/row-locks';
import { SeatsService } from '../seats/seats.service';

/**
 * Mükellef ↔ Müşavir yetkilendirme akışı. "En fazla 1 aktif müşavir" kuralı
 * DB'deki `active_lock` UNIQUE indeksiyle garanti edilir; burada aktifleştirme
 * transaction'ında `taxpayer_profiles.current_accountant_id` denormalize
 * pointer'ı da senkron tutulur.
 */
@Injectable()
export class AuthorizationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AccountantAuthorization)
    private readonly auths: Repository<AccountantAuthorization>,
    private readonly seats: SeatsService,
  ) {}

  /** Mükellef, bir müşavire yetki talebi oluşturur (pending). */
  async requestByTaxpayer(taxpayerId: string, accountantId: string): Promise<AccountantAuthorization> {
    const activeExists = await this.auths.exist({
      where: { taxpayerId, status: AuthorizationStatus.ACTIVE },
    });
    if (activeExists) {
      throw new ConflictException('Zaten aktif bir mali müşaviriniz var. Önce mevcut yetkiyi kaldırın.');
    }
    return this.auths.save(
      this.auths.create({
        taxpayerId,
        accountantId,
        status: AuthorizationStatus.PENDING,
        requestedBy: 'taxpayer',
      }),
    );
  }

  /** Müşavir talebi kabul eder → aktifleştirir (atomik + pointer senkron). */
  async accept(authId: string, accountantId: string): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      const auth = await tx.findOne(AccountantAuthorization, { where: { id: authId } });
      if (!auth || auth.accountantId !== accountantId) {
        throw new NotFoundException('Yetki talebi bulunamadı.');
      }
      if (auth.status !== AuthorizationStatus.PENDING) {
        throw new BadRequestException('Yalnızca bekleyen talepler kabul edilebilir.');
      }

      // Koltuk kontrolü yetki YAZILMADAN önce: paketi dolu bir müşavirin mükellefi
      // kabul edip sonra kotasız kalması, kullanıcıya "kabul ettim ama çalışmıyor"
      // olarak yansırdı.
      await this.seats.assertSeatAvailable(auth.accountantId, auth.taxpayerId, tx);

      // Aşağıdaki `save(auth)` FK üzerinden mükellef satırında S kilidi tutuyor, sonraki
      // `update(TaxpayerProfile)` ise X istiyor. Aynı mükellefe eşzamanlı iki kabul/iptal
      // bu yükseltmede deadlock üretir — X'i baştan alıyoruz (bkz. row-locks.ts).
      await lockTaxpayerForUpdate(tx, auth.taxpayerId);

      try {
        auth.status = AuthorizationStatus.ACTIVE;
        auth.authorizedAt = new Date();
        await tx.save(auth); // active_lock UNIQUE ihlali → 1'den fazla aktif engellenir
      } catch (e) {
        if ((e as { code?: string }).code === 'ER_DUP_ENTRY') {
          throw new ConflictException('Bu mükellefin zaten aktif bir müşaviri var.');
        }
        throw e;
      }

      await tx.update(TaxpayerProfile, { id: auth.taxpayerId }, { currentAccountantId: accountantId });

      // Koltuk kotası AYNI tx'te yazılır — yetki ile kota ayrışırsa mükellef ya
      // bedava hak kazanır ya da hakkını kaybeder.
      await this.seats.applySeat(auth.taxpayerId, accountantId, tx);
    });
  }

  /** Yetkiyi kaldır (mükellef veya müşavir). Pointer temizlenir. */
  async revoke(authId: string): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      const auth = await tx.findOne(AccountantAuthorization, { where: { id: authId } });
      if (!auth) throw new NotFoundException('Yetki bulunamadı.');

      // accept() ile aynı gerekçe: S→X yükseltmesini önlemek için X kilidi baştan alınır.
      await lockTaxpayerForUpdate(tx, auth.taxpayerId);

      auth.status = AuthorizationStatus.REVOKED;
      auth.revokedAt = new Date();
      await tx.save(auth);

      await tx.update(
        TaxpayerProfile,
        { id: auth.taxpayerId, currentAccountantId: auth.accountantId },
        { currentAccountantId: null as unknown as string },
      );

      // Koltuk boşalır ve müşavir tarafında aynı dönem içinde yeniden kullanılabilir.
      // Mükellefin evrakı SİLİNMEZ: kendi planı yoksa arşiv moduna düşer, yükleme
      // durur ama görüntüleme/indirme/dışa aktarma açık kalır.
      await this.seats.releaseSeat(auth.taxpayerId, tx);
    });
  }

  /** Bir müşavirin yetkili olduğu mükellefler. */
  listForAccountant(accountantId: string, status?: AuthorizationStatus) {
    return this.auths.find({
      where: { accountantId, ...(status ? { status } : {}) },
      relations: { taxpayer: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Bir mükellefin kendi yetkilendirmeleri (müşavir bilgisi ile). */
  listForTaxpayer(taxpayerId: string) {
    return this.auths.find({
      where: { taxpayerId },
      relations: { accountant: true },
      order: { createdAt: 'DESC' },
    });
  }
}
