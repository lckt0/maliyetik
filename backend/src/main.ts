import 'reflect-metadata';
import { setDefaultAutoSelectFamily } from 'net';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { Configuration } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { createMaintenanceMiddleware } from './common/middleware/maintenance.middleware';
import { SettingsService } from './modules/settings/settings.service';

// Konteynerde IPv6 yok (eth0 yalnızca IPv4); AAAA kayıtlarına çıkan her deneme
// ENETUNREACH ile dönüyor. Node 20'de varsayılan açık olan "Happy Eyeballs" adres
// seçimi ise her denemeye yalnızca 250 ms tanıyor — soğuk yoldaki bir TCP el
// sıkışması (ölçümde 0.3–4 sn) bunu aşınca istek ETIMEDOUT'a düşüyor. Pratikte
// GCS'in token isteği (oauth2/googleapis) düzensiz biçimde patlıyor ve evrak
// yüklemesi kullanıcıya "Beklenmeyen bir hata oluştu" olarak yansıyordu.
// IPv6 rotası olmadığı için otomatik seçim bir fayda sağlamıyor: kapatıldığında
// getaddrinfo (RFC 6724) zaten IPv4'ü başa koyuyor. Süreyi uzatmak yetmiyor,
// yalnızca eşiği ötelediği için kapatmak tercih edildi.
setDefaultAutoSelectFamily(false);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<Configuration, true>);

  // Nginx Proxy Manager arkasında — gerçek IP/protokol için trust proxy
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({
    origin: config.get('corsOrigins', { infer: true }),
    credentials: true,
  });

  // Global prefix/versioning öncesinde — path eşleştirme MiddlewareConsumer.exclude()'a göre daha öngörülebilir.
  app.use(
    createMaintenanceMiddleware(
      app.get(SettingsService),
      app.get(JwtService),
      config.get('jwt', { infer: true }).accessSecret,
    ),
  );

  // Tüm uçlar /api/v1 altında (NPM burayı proxy'ler)
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableShutdownHooks();

  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Maliyetik API çalışıyor: http://0.0.0.0:${port}/api/v1`);
}

bootstrap();
