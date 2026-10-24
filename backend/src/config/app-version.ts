import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `package.json`'daki sürüm numarası. `process.cwd()` üzerinden okunur —
 * hem `npm run start:dev` (backend/) hem prod container (WORKDIR /app) için
 * package.json her zaman çalışma dizininde bulunur.
 */
export const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * İmaja gömülen build damgası. `package.json` sürümü elle yükseltilmediği sürece
 * sabit kaldığı için, çalışan kodun hangi commit olduğunu ancak bu söyler.
 * Değerler Dockerfile'daki ARG/ENV üzerinden gelir; yerelde `npm run start:dev`
 * ile çalışırken boştur.
 */
export const APP_BUILD = {
  version: APP_VERSION,
  commit: process.env.GIT_SHA || null,
  builtAt: process.env.BUILD_TIME || null,
} as const;
