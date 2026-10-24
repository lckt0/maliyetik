import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxpayerProfile, User } from '../../database/entities';
import { Role, QuotaReason, UserStatus } from '../../shared/enums';
import { QuotaService } from '../quota/quota.service';

/** Kayıt sonrası hesabın gerçekten kullanılabilir hale geldiği tek nokta — burada "free tier" kavramı yok, bu yüzden sabit bir başlangıç kotası seçildi. */
export const SIGNUP_INITIAL_QUOTA = 20;

/**
 * Bir hesap ne zaman tam aktif olur: e-posta doğrulandığında (onay gerekmiyorsa)
 * ya da admin onayladığında (bkz. AuthService.verifyEmail / AdminUsersService.approve).
 * Her iki yol da bu tek metoda çıkar.
 */
@Injectable()
export class UserActivationService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(TaxpayerProfile) private readonly taxpayers: Repository<TaxpayerProfile>,
    private readonly quota: QuotaService,
  ) {}

  async activate(userId: string): Promise<void> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');

    user.status = UserStatus.ACTIVE;
    await this.users.save(user);

    if (user.role === Role.TAXPAYER) {
      const profile = await this.taxpayers.findOneBy({ userId: user.id });
      if (profile) {
        await this.quota.grant(profile.id, SIGNUP_INITIAL_QUOTA, QuotaReason.INITIAL, 'Kayıt sonrası başlangıç kotası');
      }
    }
  }
}
