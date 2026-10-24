import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../../database/entities';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { isIpAllowed, normalizeIp } from './maintenance-check.util';

/**
 * Tekil satırlı (id=1) sistem ayarları. `getCached()` her request'te (bakım
 * modu middleware'i dahil) DB'ye gitmeden okunur — tek backend replikası
 * olduğundan `update()` sonrası önbellek anında güncellenir, yayılma
 * gecikmesi yoktur.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private cached: SystemSetting;

  constructor(@InjectRepository(SystemSetting) private readonly repo: Repository<SystemSetting>) {}

  async onModuleInit(): Promise<void> {
    let row = await this.repo.findOneBy({ id: 1 });
    if (!row) {
      row = await this.repo.save(this.repo.create({ id: 1, maintenanceAllowedIps: [] }));
    }
    this.cached = row;
  }

  getCached(): SystemSetting {
    return this.cached;
  }

  get(): Promise<SystemSetting> {
    return this.repo.findOneByOrFail({ id: 1 });
  }

  /**
   * Bakım modu kapalıdan açığa geçiyorsa, işlemi yapan admin'in kendi IP'si
   * allowlist'e otomatik eklenir — aksi halde ayarı değiştiren admin kendini
   * anında dışarıda bırakabilir.
   */
  async update(dto: UpdateSettingsDto, actorUserId: string, actorIp: string): Promise<SystemSetting> {
    const current = await this.repo.findOneByOrFail({ id: 1 });
    const turningOn = dto.maintenanceMode === true && !current.maintenanceMode;

    let allowedIps = dto.maintenanceAllowedIps ?? current.maintenanceAllowedIps;
    if (turningOn) {
      const ip = normalizeIp(actorIp);
      if (!isIpAllowed(ip, allowedIps)) allowedIps = [...allowedIps, ip];
    }

    const next = this.repo.merge(current, { ...dto, maintenanceAllowedIps: allowedIps, updatedByUserId: actorUserId });
    await this.repo.save(next);
    this.cached = next;
    return next;
  }
}
