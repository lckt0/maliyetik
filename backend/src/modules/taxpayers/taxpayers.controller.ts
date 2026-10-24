import { Body, Controller, Get, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxpayerProfile } from '../../database/entities';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';
import { AccessControlService } from '../authorizations/access-control.service';
import { UpdateLucaSettingsDto } from './dto/update-luca-settings.dto';

const LUCA_SETTINGS_FIELDS: Array<keyof TaxpayerProfile> = [
  'id',
  'companyTitle',
  'lucaKasaHesapKodu',
  'lucaKrediKartiHesapKodu',
  'lucaYemekKartiHesapKodu',
  'lucaKdv0ToplamHesapKodu',
  'lucaKdv10ToplamHesapKodu',
  'lucaKdv10HesaplananHesapKodu',
  'lucaKdv20ToplamHesapKodu',
  'lucaKdv20HesaplananHesapKodu',
  'lucaBelgeTuru',
];

@Controller('taxpayers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxpayersController {
  constructor(
    @InjectRepository(TaxpayerProfile) private readonly repo: Repository<TaxpayerProfile>,
    private readonly access: AccessControlService,
  ) {}

  /** Mükellefin kendi profili (+ mevcut müşavir + kota). */
  @Get('me')
  @Roles(Role.TAXPAYER)
  async me(@CurrentUser() user: AuthUser) {
    const tp = await this.repo.findOne({
      where: { id: user.taxpayerId },
      relations: { currentAccountant: true },
    });
    if (!tp) throw new NotFoundException('Profil bulunamadı.');
    return tp;
  }

  /**
   * Dışa Aktar → Z-Raporu/Luca Excel hesap kodları — yalnızca mükellefin muhasebesini
   * tutan mali müşavir (veya admin) görür/düzenler; mükellefin kendisi bu alanla
   * ilgilenmez (bkz. mevcut "Luca'dan İçe Aktar" özelliği de aynı şekilde müşavire özel).
   */
  @Get(':id/luca-settings')
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  async getLucaSettings(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.access.assertTaxpayerAccess(user, id);
    const tp = await this.repo.findOne({ where: { id }, select: LUCA_SETTINGS_FIELDS });
    if (!tp) throw new NotFoundException('Mükellef bulunamadı.');
    return tp;
  }

  @Patch(':id/luca-settings')
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  async updateLucaSettings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLucaSettingsDto) {
    await this.access.assertTaxpayerAccess(user, id);
    const exists = await this.repo.exist({ where: { id } });
    if (!exists) throw new NotFoundException('Mükellef bulunamadı.');
    await this.repo.update({ id }, dto);
    return this.repo.findOne({ where: { id }, select: LUCA_SETTINGS_FIELDS });
  }
}
