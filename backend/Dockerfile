# ============================================================================
#  Maliyetik Backend — multi-stage build
# ============================================================================

# ---- builder ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# bcrypt native derleme için gerekli araçlar
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- production -------------------------------------------------------------
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# `chromium`: HTML→PDF dönüşümü (puppeteer-core) için — Alpine/musl'da Puppeteer'ın
# kendi indirdiği Chromium çalışmadığından sistem paketi kullanılır.
RUN apk add --no-cache python3 make g++ chromium \
    && addgroup -S app && adduser -S app -G app
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force \
    && apk del python3 make g++

# Derlenmiş çıktı + migration/seed için gerekli kaynaklar
COPY --from=builder /app/dist ./dist

# Sürüm damgası (commit + derleme zamanı /health'te görünür). En sonda durur ki
# BUILD_TIME değiştiğinde önceki katmanların önbelleği bozulmasın.
ARG GIT_SHA=""
ARG BUILD_TIME=""
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

USER app
EXPOSE 3000

# Basit HTTP healthcheck (/api/v1/health ucu)
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]

# ---- migrator -----------------------------------------------------------
#  `production`'da src/ ve ts-node yok (imaj küçük tutuluyor), bu yüzden
#  `npm run migration:run` orada çalışamaz. `builder`'ı temel alan bu aşama
#  src + devDependencies'i korur; yalnızca tek seferlik `docker compose run`
#  ile migration uygulamak için kullanılır (bkz. docker-compose.yml
#  `backend-migrate` servisi, `tools` profile).
FROM builder AS migrator
CMD ["npm", "run", "migration:run"]
