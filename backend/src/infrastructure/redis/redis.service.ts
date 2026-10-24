import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Configuration } from '../../config/configuration';

/** Tekil ioredis istemcisi. `ioredis` zaten bağımlılık olarak yüklüydü ama hiç instantiate edilmemişti. */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  client: Redis;

  constructor(private readonly config: ConfigService<Configuration, true>) {}

  onModuleInit(): void {
    const redisCfg = this.config.get('redis', { infer: true });
    this.client = new Redis({
      host: redisCfg.host,
      port: redisCfg.port,
      password: redisCfg.password,
      lazyConnect: false,
      maxRetriesPerRequest: 2,
    });
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }
}
