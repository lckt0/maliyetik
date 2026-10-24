import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountantAuthorization, TaxpayerProfile } from '../../database/entities';
import { AuthUser } from '../../common/types/auth-user';
import { AuthorizationStatus, Role } from '../../shared/enums';

/**
 * Bir aktörün belirli bir mükellef kapsamında işlem yapıp yapamayacağını
 * çözer. Tüm evrak/şirket-evrak uçları bu kapıdan geçer.
 *   - admin       : her mükellef
 *   - taxpayer    : yalnızca kendi profili
 *   - accountant  : yalnızca kendisine AKTİF yetki vermiş mükellefler
 */
@Injectable()
export class AccessControlService {
  constructor(
    @InjectRepository(AccountantAuthorization)
    private readonly auths: Repository<AccountantAuthorization>,
    @InjectRepository(TaxpayerProfile)
    private readonly taxpayers: Repository<TaxpayerProfile>,
  ) {}

  /** Erişilebilir tek mükellefi doğrular; değilse 403 fırlatır. */
  async assertTaxpayerAccess(user: AuthUser, taxpayerId: string): Promise<void> {
    if (user.role === Role.ADMIN) return;

    if (user.role === Role.TAXPAYER) {
      if (user.taxpayerId && user.taxpayerId === taxpayerId) return;
      throw new ForbiddenException('Bu mükellefe erişim yetkiniz yok.');
    }

    if (user.role === Role.ACCOUNTANT && user.accountantId) {
      const active = await this.auths.exist({
        where: {
          accountantId: user.accountantId,
          taxpayerId,
          status: AuthorizationStatus.ACTIVE,
        },
      });
      if (active) return;
    }
    throw new ForbiddenException('Bu mükellefe erişim yetkiniz yok.');
  }

  /**
   * `assertTaxpayerAccess` ile aynı kapsam kontrolünü yapar, ek olarak — yalnızca
   * müşavir için — mükellefin Hesap sayfasından kapatabildiği kota/AI kredi
   * görünürlük anahtarını da denetler (admin ve mükellefin kendisi bu anahtardan
   * etkilenmez, o yalnızca müşavirin görünürlüğünü kontrol eder).
   */
  async assertTaxpayerDataVisibleToAccountant(
    user: AuthUser,
    taxpayerId: string,
    field: 'accountantCanViewQuota' | 'accountantCanViewAiCredits',
  ): Promise<TaxpayerProfile> {
    await this.assertTaxpayerAccess(user, taxpayerId);
    const profile = await this.taxpayers.findOne({ where: { id: taxpayerId } });
    if (!profile) throw new NotFoundException('Mükellef bulunamadı.');
    if (user.role === Role.ACCOUNTANT && !profile[field]) {
      throw new ForbiddenException('Mükellef bu bilgiyi paylaşmayı kapatmış.');
    }
    return profile;
  }

  /** Müşavirin erişebildiği mükellef id listesi (listeleme scope'u için). */
  async accessibleTaxpayerIds(user: AuthUser): Promise<string[] | 'ALL'> {
    if (user.role === Role.ADMIN) return 'ALL';
    if (user.role === Role.TAXPAYER) return user.taxpayerId ? [user.taxpayerId] : [];
    if (user.role === Role.ACCOUNTANT && user.accountantId) {
      const rows = await this.auths.find({
        where: { accountantId: user.accountantId, status: AuthorizationStatus.ACTIVE },
        select: ['taxpayerId'],
      });
      return rows.map((r) => r.taxpayerId);
    }
    return [];
  }
}
