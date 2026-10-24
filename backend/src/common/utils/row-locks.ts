import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TaxpayerProfile } from '../../database/entities';

/**
 * Mükellef satırını, ona bağlı bir satıra YAZACAK tx'in EN BAŞINDA X kilidine alır.
 *
 * Neden gerekli: `documents`, `accountant_authorizations`, `quota_ledger` gibi tablolar
 * `taxpayer_profiles`'a FK ile bağlı. Bu tablolara INSERT/UPDATE/DELETE yapan bir tx,
 * FK doğrulaması için ilgili mükellef satırında örtük bir **S** (shared) kilidi tutar.
 * Aynı tx daha sonra o satırı güncellemek isterse (kota sayacı, `current_accountant_id`)
 * **X** (exclusive) kilidi gerekir.
 *
 * İki tx aynı mükellefte bunu eşzamanlı yaparsa ikisi de S tutup ikisi de X beklediği
 * için S→X yükseltmesi çözülemez; InnoDB birini "Deadlock found when trying to get lock"
 * ile geri alır ve işlem kullanıcıya başarısız görünür (ör. Luca içe aktarımının
 * paralel yüklemeleri).
 *
 * X kilidi ilk ifadede alınınca ikinci tx elinde hiç S tutmadan bekler — yükseltme
 * oluşmaz, işlemler deadlock yerine sırayla akar. Kilit tx sonunda serbest kalır.
 */
export async function lockTaxpayerForUpdate(tx: EntityManager, taxpayerId: string): Promise<void> {
  const tp = await tx
    .createQueryBuilder(TaxpayerProfile, 't')
    .setLock('pessimistic_write')
    .where('t.id = :id', { id: taxpayerId })
    .getOne();
  if (!tp) throw new NotFoundException('Mükellef bulunamadı.');
}

/**
 * Birden çok mükellefi (ör. toplu kalıcı silme) aynı tx'te kilitler.
 *
 * Kilitler ID sırasına göre alınır: iki toplu işlem kesişen mükellef kümelerine ters
 * sırada girerse birbirini kilitlerdi (A→B ile B→A). Sabit bir sıra bu ihtimali ortadan
 * kaldırır — sıranın hangi kural olduğu değil, tüm çağrılarda AYNI olması önemli.
 */
export async function lockTaxpayersForUpdate(tx: EntityManager, taxpayerIds: string[]): Promise<void> {
  for (const id of [...new Set(taxpayerIds)].sort()) {
    await lockTaxpayerForUpdate(tx, id);
  }
}
