import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_BUILD, APP_VERSION } from '../../config/app-version';

/** Docker/NPM healthcheck ucu. Public (auth yok). */
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    let db = false;
    try {
      await this.dataSource.query('SELECT 1');
      db = true;
    } catch {
      db = false;
    }
    return {
      status: db ? 'ok' : 'degraded', db, version: APP_VERSION,
      commit: APP_BUILD.commit, builtAt: APP_BUILD.builtAt,
      ts: new Date().toISOString(),
    };
  }
}
