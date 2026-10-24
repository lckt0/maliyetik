import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { SettingsService } from '../../modules/settings/settings.service';
import { isIpAllowed } from '../../modules/settings/maintenance-check.util';
import { Role } from '../../shared/enums';

const ALWAYS_ALLOWED_PATHS = new Set(['/api/v1/health', '/api/v1/system/status']);

/**
 * Bakım modu — `main.ts`'te `app.use(...)` ile, `setGlobalPrefix`/`enableVersioning`
 * öncesinde kaydedilir (MiddlewareConsumer.exclude()'un global prefix + versioning
 * ile path eşleştirme belirsizliğinden kaçınmak için). IP allowlist dışındaki
 * istekler 503 alır; geçerli bir admin JWT'si taşıyan istekler, admin farklı bir
 * IP'den giriş yaparsa kilitlenip kalmasın diye bir güvenlik ağı olarak geçer.
 */
export function createMaintenanceMiddleware(
  settings: SettingsService,
  jwt: JwtService,
  accessSecret: string,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (ALWAYS_ALLOWED_PATHS.has(req.path)) return next();

    const s = settings.getCached();
    if (!s.maintenanceMode) return next();
    if (isIpAllowed(req.ip ?? '', s.maintenanceAllowedIps)) return next();

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.slice(7), { secret: accessSecret });
        if (payload?.role === Role.ADMIN) return next();
      } catch {
        // geçersiz/süresi dolmuş token — aşağıda 503
      }
    }

    res.status(503).json({
      statusCode: 503,
      error: { code: 'MAINTENANCE', message: 'Sistem bakımda. Lütfen daha sonra tekrar deneyin.' },
    });
  };
}
