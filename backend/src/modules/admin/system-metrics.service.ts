import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as os from 'os';
import { RedisService } from '../../infrastructure/redis/redis.service';

const METRICS_CACHE_KEY = 'admin:system-metrics:v1';
const METRICS_CACHE_TTL_SECONDS = 15;

export interface SystemMetrics {
  app: {
    cpuLoadPercent: number;
    memTotalBytes: number;
    memFreeBytes: number;
    processRssBytes: number;
    processHeapUsedBytes: number;
    uptimeSeconds: number;
  };
  mysql: {
    threadsConnected: number;
    maxConnections: number;
    bufferPoolUsedPercent: number;
    dbSizeBytes: number;
    uptimeSeconds: number;
  };
  redis: {
    usedMemoryBytes: number;
    connectedClients: number;
    uptimeSeconds: number;
  } | null;
}

/** Donanım/kaynak metrikleri — MySQL/Redis'in kendi durum komutları + Node os/process (docker.sock yok). */
@Injectable()
export class SystemMetricsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async getMetrics(): Promise<SystemMetrics> {
    const cached = await this.redis.client.get(METRICS_CACHE_KEY).catch(() => null);
    if (cached) return JSON.parse(cached) as SystemMetrics;

    const [mysql, redis] = await Promise.all([this.mysqlMetrics(), this.redisMetrics()]);
    const metrics: SystemMetrics = { app: this.appMetrics(), mysql, redis };
    await this.redis.client
      .set(METRICS_CACHE_KEY, JSON.stringify(metrics), 'EX', METRICS_CACHE_TTL_SECONDS)
      .catch(() => undefined);
    return metrics;
  }

  private appMetrics(): SystemMetrics['app'] {
    const cpuCount = os.cpus().length || 1;
    const mem = process.memoryUsage();
    return {
      cpuLoadPercent: Math.min(100, (os.loadavg()[0] / cpuCount) * 100),
      memTotalBytes: os.totalmem(),
      memFreeBytes: os.freemem(),
      processRssBytes: mem.rss,
      processHeapUsedBytes: mem.heapUsed,
      uptimeSeconds: process.uptime(),
    };
  }

  private async mysqlMetrics(): Promise<SystemMetrics['mysql']> {
    const statusRows: Array<{ Variable_name: string; Value: string }> = await this.dataSource.query(
      `SHOW STATUS WHERE Variable_name IN
        ('Threads_connected','Uptime','Innodb_buffer_pool_pages_data','Innodb_buffer_pool_pages_total')`,
    );
    const status = Object.fromEntries(statusRows.map((r) => [r.Variable_name, r.Value]));

    const maxConnRows: Array<{ Variable_name: string; Value: string }> = await this.dataSource.query(
      `SHOW VARIABLES LIKE 'max_connections'`,
    );
    const maxConnections = Number(maxConnRows[0]?.Value ?? 0);

    const sizeRows: Array<{ bytes: string | null }> = await this.dataSource.query(
      `SELECT SUM(data_length + index_length) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()`,
    );

    const poolTotal = Number(status.Innodb_buffer_pool_pages_total ?? 0);
    const poolData = Number(status.Innodb_buffer_pool_pages_data ?? 0);

    return {
      threadsConnected: Number(status.Threads_connected ?? 0),
      maxConnections,
      bufferPoolUsedPercent: poolTotal > 0 ? (poolData / poolTotal) * 100 : 0,
      dbSizeBytes: Number(sizeRows[0]?.bytes ?? 0),
      uptimeSeconds: Number(status.Uptime ?? 0),
    };
  }

  private async redisMetrics(): Promise<SystemMetrics['redis']> {
    try {
      const info = await this.redis.client.info();
      const parsed = Object.fromEntries(
        info
          .split('\r\n')
          .filter((l) => l.includes(':'))
          .map((l) => l.split(':') as [string, string]),
      );
      return {
        usedMemoryBytes: Number(parsed.used_memory ?? 0),
        connectedClients: Number(parsed.connected_clients ?? 0),
        uptimeSeconds: Number(parsed.uptime_in_seconds ?? 0),
      };
    } catch {
      return null;
    }
  }
}
