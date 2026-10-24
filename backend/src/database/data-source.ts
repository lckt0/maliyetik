import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

/**
 * TypeORM CLI DataSource (migration üretimi/çalıştırma için).
 * Uygulama içi bağlantı `TypeOrmModule.forRootAsync` ile kurulur (app.module.ts).
 *
 * NOT: Şema, Docker ilk kalkışında `docker/mysql/init/*.sql` ile uygulanır.
 * Docker dışı ortamlarda `npm run migration:run` bu DataSource'u kullanır.
 * `synchronize` her ortamda KAPALIDIR (production güvenliği).
 */
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME ?? 'maliyetik',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'maliyetik',
  entities: ALL_ENTITIES,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  charset: 'utf8mb4', // bkz. app.module.ts — Türkçe collation kolon seviyesinde
  timezone: 'Z',
});
