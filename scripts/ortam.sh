#!/usr/bin/env bash
# ============================================================================
#  Maliyetik — Ortam Yönetim Aracı (development / production)
#
#  İki ortam, TEK docker-compose.yml üzerinden, farklı proje adı + env dosyası
#  ile birbirinden tamamen izole çalışır (ayrı ağ, ayrı volume, ayrı imaj):
#
#    development → proje: maliyetik-dev   env: .env.development   port: 3341
#    production  → proje: maliyetik       env: .env                port: 3340
#
#  Kullanım:
#    ./scripts/ortam.sh              → interaktif menü
#    ./scripts/ortam.sh <komut>      → tek seferlik (otomasyon/CI için)
#
#  Komutlar: status, dev-up, dev-down, dev-logs [servis], dev-migrate, dev-seed,
#            promote, rollback, prod-logs [servis], prod-stop, prod-start,
#            backup-db <dev|prod>, restore-db <dev|prod> <dosya>, compare, help
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Sürüm damgası — imaja build arg olarak gömülür, /api/v1/health'te görünür.
export GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo '')"
export BUILD_TIME="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="$PROJECT_DIR/backups"
ROLLBACK_TAG="rollback"

PROD_PROJECT="maliyetik"
PROD_ENV_FILE=".env"

DEV_PROJECT="maliyetik-dev"
DEV_ENV_FILE=".env.development"

# ---- Renkler / yardımcı çıktılar -------------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'
else
  C_RESET=""; C_BOLD=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""
fi

info()  { echo "${C_BLUE}➜${C_RESET} $*"; }
ok()    { echo "${C_GREEN}✔${C_RESET} $*"; }
warn()  { echo "${C_YELLOW}⚠${C_RESET} $*"; }
err()   { echo "${C_RED}✘${C_RESET} $*" >&2; }
title() { echo; echo "${C_BOLD}== $* ==${C_RESET}"; }

# ---- Compose sarmalayıcı ----------------------------------------------------
# compose <proje> <env-dosyası> <compose args...>
compose() {
  local project="$1" envfile="$2"
  shift 2
  docker compose -p "$project" --env-file "$envfile" -f "$COMPOSE_FILE" "$@"
}

require_env_file() {
  local envfile="$1" example="$2"
  if [[ ! -f "$envfile" ]]; then
    err "$envfile bulunamadı."
    info "Önce oluştur:  cp $example $envfile   ve değerleri doldur."
    return 1
  fi
}

confirm() {
  # confirm "Mesaj" "BEKLENEN_KELIME"
  local msg="$1" word="$2" reply
  warn "$msg"
  read -r -p "Onaylamak için '${C_BOLD}${word}${C_RESET}' yaz: " reply
  [[ "$reply" == "$word" ]]
}

# ---- Durum -------------------------------------------------------------------
cmd_status() {
  title "Development ($DEV_PROJECT)"
  if [[ -f "$DEV_ENV_FILE" ]]; then
    compose "$DEV_PROJECT" "$DEV_ENV_FILE" ps 2>/dev/null || warn "Development ayakta değil."
  else
    warn "$DEV_ENV_FILE yok — development hiç kurulmamış."
  fi

  title "Production ($PROD_PROJECT)"
  if [[ -f "$PROD_ENV_FILE" ]]; then
    compose "$PROD_PROJECT" "$PROD_ENV_FILE" ps 2>/dev/null || warn "Production ayakta değil."
  else
    warn "$PROD_ENV_FILE yok."
  fi
  echo
}

# ---- Development ---------------------------------------------------------
cmd_dev_up() {
  require_env_file "$DEV_ENV_FILE" ".env.development.example" || return 1
  info "Development derleniyor (güncel kod: $(git rev-parse --short HEAD 2>/dev/null || echo '?')) ..."
  compose "$DEV_PROJECT" "$DEV_ENV_FILE" build
  compose "$DEV_PROJECT" "$DEV_ENV_FILE" up -d
  ok "Development ayakta."
  compose "$DEV_PROJECT" "$DEV_ENV_FILE" ps
  local port; port=$(grep -E '^FRONTEND_HOST_PORT=' "$DEV_ENV_FILE" | tail -1 | cut -d= -f2-)
  info "http://localhost:${port:-3341}"
}

cmd_dev_down() {
  require_env_file "$DEV_ENV_FILE" ".env.development.example" || return 1
  compose "$DEV_PROJECT" "$DEV_ENV_FILE" down
  ok "Development durduruldu."
}

cmd_dev_logs() {
  require_env_file "$DEV_ENV_FILE" ".env.development.example" || return 1
  compose "$DEV_PROJECT" "$DEV_ENV_FILE" logs -f --tail=200 ${1:-}
}

cmd_dev_migrate() {
  require_env_file "$DEV_ENV_FILE" ".env.development.example" || return 1
  info "Development'ta bekleyen migration'lar uygulanıyor..."
  compose "$DEV_PROJECT" "$DEV_ENV_FILE" run --build --rm --no-deps backend-migrate
  ok "Migration tamamlandı."
}

cmd_dev_seed() {
  require_env_file "$DEV_ENV_FILE" ".env.development.example" || return 1
  compose "$DEV_PROJECT" "$DEV_ENV_FILE" exec backend npm run seed:prod
}

# ---- Production: yedekleme / geri alma --------------------------------------
backup_db() {
  local project="$1" envfile="$2" label="$3"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  local file="$BACKUP_DIR/${label}-$(date +%Y%m%d-%H%M%S).sql.gz"
  info "Veritabanı yedeği alınıyor → $file"
  ( umask 077
    compose "$project" "$envfile" exec -T mysql \
      sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
      | gzip > "$file" )
  chmod 600 "$file"
  ok "Yedek alındı: $file ($(du -h "$file" | cut -f1))"
}

cmd_backup_db() {
  case "${1:-}" in
    prod) require_env_file "$PROD_ENV_FILE" ".env.example" && backup_db "$PROD_PROJECT" "$PROD_ENV_FILE" "prod" ;;
    dev)  require_env_file "$DEV_ENV_FILE" ".env.development.example" && backup_db "$DEV_PROJECT" "$DEV_ENV_FILE" "dev" ;;
    *) err "Kullanım: backup-db <dev|prod>"; return 1 ;;
  esac
}

cmd_restore_db() {
  local target="${1:-}" file="${2:-}"
  local project envfile label
  case "$target" in
    prod) project="$PROD_PROJECT"; envfile="$PROD_ENV_FILE"; label="PRODUCTION" ;;
    dev)  project="$DEV_PROJECT";  envfile="$DEV_ENV_FILE";  label="DEVELOPMENT" ;;
    *) err "Kullanım: restore-db <dev|prod> <yedek-dosyası.sql.gz>"; return 1 ;;
  esac
  [[ -f "$file" ]] || { err "Dosya bulunamadı: $file"; return 1; }
  confirm "$label veritabanının ÜZERİNE '$file' geri yüklenecek. Mevcut veri KAYBOLUR (önce yeni bir yedek almadıysan)." "$label-GERI-YUKLE" || { info "İptal edildi."; return 1; }
  info "Geri yükleniyor..."
  gunzip -c "$file" | compose "$project" "$envfile" exec -T mysql \
    sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"'
  ok "Geri yükleme tamamlandı."
}

# ---- Production: yayına alma / geri dönme -----------------------------------
tag_rollback_point() {
  for svc in backend frontend; do
    local img="${PROD_PROJECT}-${svc}"
    if docker image inspect "${img}:latest" >/dev/null 2>&1; then
      docker tag "${img}:latest" "${img}:${ROLLBACK_TAG}"
    fi
  done
  ok "Şu anki production imajları ':${ROLLBACK_TAG}' olarak işaretlendi (hızlı geri dönüş için)."
}

cmd_promote() {
  require_env_file "$PROD_ENV_FILE" ".env.example" || return 1

  title "Production'a Yükselt"
  echo "Yayınlanacak kod: $(git log -1 --oneline 2>/dev/null || echo '?')"
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    warn "Çalışma dizininde commit edilmemiş değişiklikler var — onlar da imaja dahil olacak."
  fi
  echo
  warn "Bu işlem PRODUCTION'ı güncel koddan yeniden derleyip yeniden başlatacak."
  confirm "Development'ta test ettiğinden emin misin?" "PRODUCTION" || { info "İptal edildi."; return 1; }

  # Soru docker komutlarından önce sorulur; `docker compose build` stdin'i tüketebilir.
  read -r -p "Bekleyen veritabanı migration'ları derleme/başlatmadan sonra uygulansın mı? (e/H): " run_migrations

  tag_rollback_point
  backup_db "$PROD_PROJECT" "$PROD_ENV_FILE" "prod-pre-promote"

  info "Production derleniyor..."
  compose "$PROD_PROJECT" "$PROD_ENV_FILE" build
  info "Production yeniden başlatılıyor..."
  compose "$PROD_PROJECT" "$PROD_ENV_FILE" up -d
  ok "Production güncellendi."
  compose "$PROD_PROJECT" "$PROD_ENV_FILE" ps

  echo
  if [[ "$run_migrations" =~ ^[eE]$ ]]; then
    compose "$PROD_PROJECT" "$PROD_ENV_FILE" run --build --rm --no-deps backend-migrate
    ok "Migration tamamlandı."
  else
    info "Migration atlandı — daha sonra: ./scripts/ortam.sh prod-migrate"
  fi
  echo
  ok "Yayına alma tamamlandı. Sorun olursa: ./scripts/ortam.sh rollback"
}

cmd_prod_migrate() {
  require_env_file "$PROD_ENV_FILE" ".env.example" || return 1
  compose "$PROD_PROJECT" "$PROD_ENV_FILE" run --build --rm --no-deps backend-migrate
}

cmd_rollback() {
  require_env_file "$PROD_ENV_FILE" ".env.example" || return 1
  for svc in backend frontend; do
    local img="${PROD_PROJECT}-${svc}"
    if ! docker image inspect "${img}:${ROLLBACK_TAG}" >/dev/null 2>&1; then
      err "Geri dönülecek yedek imaj yok (${img}:${ROLLBACK_TAG}). Daha önce hiç 'promote' çalıştırılmamış olabilir."
      return 1
    fi
  done
  warn "Bu işlem production'daki KOD'u bir önceki 'promote' öncesi haline döndürür."
  warn "Veritabanı geri alınmaz (yalnızca imaj/kod). Gerekirse ayrıca: restore-db prod <yedek>"
  confirm "Geri dönülsün mü?" "ROLLBACK" || { info "İptal edildi."; return 1; }
  for svc in backend frontend; do
    local img="${PROD_PROJECT}-${svc}"
    docker tag "${img}:${ROLLBACK_TAG}" "${img}:latest"
  done
  compose "$PROD_PROJECT" "$PROD_ENV_FILE" up -d --force-recreate --no-deps backend frontend
  ok "Production bir önceki sürüme döndürüldü."
}

cmd_prod_logs() {
  require_env_file "$PROD_ENV_FILE" ".env.example" || return 1
  compose "$PROD_PROJECT" "$PROD_ENV_FILE" logs -f --tail=200 ${1:-}
}

cmd_prod_stop() {
  require_env_file "$PROD_ENV_FILE" ".env.example" || return 1
  confirm "Production TAMAMEN durdurulacak (site erişilemez olur)." "PRODUCTION-DURDUR" || { info "İptal edildi."; return 1; }
  compose "$PROD_PROJECT" "$PROD_ENV_FILE" stop
  ok "Production durduruldu."
}

cmd_prod_start() {
  require_env_file "$PROD_ENV_FILE" ".env.example" || return 1
  compose "$PROD_PROJECT" "$PROD_ENV_FILE" start
  ok "Production başlatıldı."
}

# ---- Karşılaştırma -----------------------------------------------------------
cmd_compare() {
  title "Development vs Production"
  printf "%-14s %-12s %s\n" "" "commit" "imaj oluşturulma tarihi"
  for svc in backend frontend; do
    local dev_img="${DEV_PROJECT}-${svc}" prod_img="${PROD_PROJECT}-${svc}"
    local dev_created prod_created
    dev_created=$(docker image inspect -f '{{.Created}}' "${dev_img}:latest" 2>/dev/null | cut -dT -f1 || echo "-")
    prod_created=$(docker image inspect -f '{{.Created}}' "${prod_img}:latest" 2>/dev/null | cut -dT -f1 || echo "-")
    echo "$svc:"
    printf "  %-12s %s\n" "development" "${dev_created:--}"
    printf "  %-12s %s\n" "production"  "${prod_created:--}"
  done
  echo
  info "Çalışma dizini commit: $(git log -1 --oneline 2>/dev/null || echo '?')"
  if ! git diff --quiet 2>/dev/null; then
    warn "Commit edilmemiş değişiklikler var."
  fi
}

cmd_help() {
  cat <<EOF
Kullanım: $(basename "$0") [komut]

Komut verilmezse interaktif menü açılır.

  status                     İki ortamın da container durumunu göster
  dev-up                     Development'ı güncel koddan derle + başlat
  dev-down                   Development'ı durdur
  dev-logs [servis]          Development loglarını izle
  dev-migrate                Development'ta migration uygula
  dev-seed                   Development'ta ilk admini oluştur
  promote                    Production'ı güncel koddan yayına al (yedekli)
  prod-migrate               Production'da migration uygula
  rollback                   Production'ı son 'promote' öncesine döndür
  prod-logs [servis]         Production loglarını izle
  prod-stop / prod-start     Production'ı durdur / başlat
  backup-db <dev|prod>       Veritabanı yedeği al
  restore-db <dev|prod> <f>  Veritabanı yedeğini geri yükle
  compare                    Development / production imajlarını karşılaştır
  help                       Bu mesaj
EOF
}

# ---- İnteraktif menü ---------------------------------------------------------
menu() {
  while true; do
    echo
    echo "${C_BOLD}Maliyetik — Ortam Yönetimi${C_RESET}"
    echo " 1) Durum"
    echo " 2) Development: derle + başlat"
    echo " 3) Development: logları izle"
    echo " 4) Development: durdur"
    echo " 5) Development: migration uygula"
    echo " 6) Development: ilk admini oluştur (seed)"
    echo " 7) Production'a YÜKSELT (promote)"
    echo " 8) Production: migration uygula"
    echo " 9) Production: son sürüme GERİ DÖN (rollback)"
    echo "10) Production: logları izle"
    echo "11) Production: durdur"
    echo "12) Production: başlat"
    echo "13) Veritabanı yedeği al"
    echo "14) Veritabanı yedeğini geri yükle"
    echo "15) Development / Production karşılaştır"
    echo " 0) Çıkış"
    echo
    read -r -p "Seçim: " choice
    case "$choice" in
      1) cmd_status ;;
      2) cmd_dev_up ;;
      3) read -r -p "Servis (boş = hepsi): " s; cmd_dev_logs "$s" ;;
      4) cmd_dev_down ;;
      5) cmd_dev_migrate ;;
      6) cmd_dev_seed ;;
      7) cmd_promote ;;
      8) cmd_prod_migrate ;;
      9) cmd_rollback ;;
      10) read -r -p "Servis (boş = hepsi): " s; cmd_prod_logs "$s" ;;
      11) cmd_prod_stop ;;
      12) cmd_prod_start ;;
      13) read -r -p "Hangi ortam (dev/prod): " e; cmd_backup_db "$e" ;;
      14)
        read -r -p "Hangi ortam (dev/prod): " e
        ls -1 "$BACKUP_DIR" 2>/dev/null | sed 's/^/  /' || true
        read -r -p "Yedek dosya yolu: " f
        cmd_restore_db "$e" "$f"
        ;;
      15) cmd_compare ;;
      0) exit 0 ;;
      *) err "Geçersiz seçim." ;;
    esac
  done
}

# ---- Giriş noktası -------------------------------------------------------------
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose bulunamadı."
  exit 1
fi

case "${1:-}" in
  "") menu ;;
  status) cmd_status ;;
  dev-up) cmd_dev_up ;;
  dev-down) cmd_dev_down ;;
  dev-logs) cmd_dev_logs "${2:-}" ;;
  dev-migrate) cmd_dev_migrate ;;
  dev-seed) cmd_dev_seed ;;
  promote) cmd_promote ;;
  prod-migrate) cmd_prod_migrate ;;
  rollback) cmd_rollback ;;
  prod-logs) cmd_prod_logs "${2:-}" ;;
  prod-stop) cmd_prod_stop ;;
  prod-start) cmd_prod_start ;;
  backup-db) cmd_backup_db "${2:-}" ;;
  restore-db) cmd_restore_db "${2:-}" "${3:-}" ;;
  compare) cmd_compare ;;
  help|-h|--help) cmd_help ;;
  *) err "Bilinmeyen komut: $1"; cmd_help; exit 1 ;;
esac
