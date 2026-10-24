import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { SettingsService } from './settings.service';
import { isIpAllowed } from './maintenance-check.util';

/** Public — SPA açılışta bakım modu/kayıt durumunu öğrenmek için çağırır. Bakım modu middleware'i bu ucu hariç tutar. */
@Controller('system')
export class SystemStatusController {
  constructor(private readonly settings: SettingsService) {}

  @Get('status')
  status(@Req() req: Request) {
    const s = this.settings.getCached();
    const allowedForCaller = !s.maintenanceMode || isIpAllowed(req.ip ?? '', s.maintenanceAllowedIps);
    return {
      maintenanceMode: s.maintenanceMode,
      allowedForCaller,
      registrationEnabled: s.registrationEnabled,
    };
  }
}
