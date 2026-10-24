# Ortam Yönetimi — `scripts/ortam.sh`

`scripts/ortam.sh`, aynı makinede bir geliştirme ve bir üretim yığınını yan yana
yönetmek için isteğe bağlı bir yardımcıdır. Tek bir yığın çalıştıracaksanız
doğrudan `docker compose` yeterlidir.

## Mimari fikri

Tek bir `docker-compose.yml` var. İki ortam, bu dosyanın **farklı proje adı** ve
**farklı `.env` dosyası** ile çalıştırılmasıyla elde ediliyor:

| | Proje adı | Env dosyası | Port | Amaç |
|---|---|---|---|---|
| **development** | `maliyetik-dev` | `.env.development` | `3341` | Değişiklikleri denemek |
| **production** | `maliyetik` | `.env` | `3340` | Canlı sistem |

Docker Compose, ağ/volume/imaj adlarını proje adıyla önekler (`maliyetik-dev_internal`,
`maliyetik-dev_mysql_data`, `maliyetik-dev-backend:latest` vb.). Bu sayede:

- **Veritabanları tamamen ayrı** — development'ta yapılan testler production verisini
  hiç etkilemez.
- **İmajlar ayrı** — development'ı yeniden derlemek production'daki çalışan imajı
  değiştirmez.
- **Ağlar ayrı** — development container'ları production container'larına hiçbir
  şekilde erişemez.

Kod her iki ortamda da **aynı repo**'dan derlenir. Aralarındaki fark yalnızca hangi
commit/çalışma-dizini durumunun derlendiği ve `.env` / `.env.development` içindeki
değerlerdir (DB parolası, port, `NODE_ENV`, vb.).

## Kurulum (bir kere)

```bash
cp .env.development.example .env.development
# Dosyayı aç, production'dan FARKLI parolalar/portlar/GCS bucket'ı gir.
```

`.env.development` de `.env` gibi git'e commit edilmez (`.gitignore`'da).

## Kullanım

İki mod var:

```bash
./scripts/ortam.sh          # interaktif menü (numara seçerek kullan)
./scripts/ortam.sh <komut>  # tek seferlik, otomasyon/CI için
```

### İnteraktif menü

Argümansız çalıştırıldığında numaralı bir menü açılır (durum, development
başlat/durdur/logla, production'a yükselt, rollback, yedekleme, karşılaştırma...).
Menüdeki her seçenek, aşağıdaki komutlardan birine karşılık gelir.

### Komutlar

| Komut | Ne yapar |
|---|---|
| `status` | İki ortamın da container durumunu (ayakta mı, sağlıklı mı) gösterir. |
| `dev-up` | Development'ı **güncel çalışma dizinindeki koddan** derler ve başlatır/günceller. Her çalıştırıldığında yeniden derler (commit etmeye gerek yok). |
| `dev-down` | Development container'larını durdurur. |
| `dev-logs [servis]` | Development loglarını canlı izler (`backend`, `frontend`, `mysql`, `redis`; boş bırakılırsa hepsi). |
| `dev-migrate` | Development veritabanında bekleyen TypeORM migration'larını uygular. |
| `dev-seed` | Development'ta `.env.development`'taki `ADMIN_EMAIL`/`ADMIN_PASSWORD` ile ilk admini oluşturur (idempotent — zaten varsa atlar). |
| `promote` | **Production'ı günceller.** Aşağıda detaylı anlatılıyor. |
| `prod-migrate` | Production veritabanında bekleyen migration'ları uygular (promote sırasında atlandıysa daha sonra manuel çalıştırmak için). |
| `rollback` | Production'ı bir önceki `promote`'tan hemen önceki imaja geri döndürür (kod/imaj geri alma — veritabanı geri alınmaz). |
| `prod-logs [servis]` | Production loglarını canlı izler. |
| `prod-stop` / `prod-start` | Production'ı tamamen durdurur / başlatır (site erişilemez olur — onay ister). |
| `backup-db <dev\|prod>` | İlgili ortamın veritabanını `backups/` altına `.sql.gz` olarak yedekler. |
| `restore-db <dev\|prod> <dosya>` | Bir yedeği geri yükler (mevcut veriyi siler — güçlü onay ister). |
| `compare` | Development ve production'daki `backend`/`frontend` imajlarının oluşturulma tarihini ve çalışma dizini commit'ini karşılaştırır. |
| `help` | Komut listesini gösterir. |

## Tipik akış: bir özelliği geliştirip production'a almak

```bash
# 1) Kodda değişiklik yap

# 2) Development'a yayınla ve dene
./scripts/ortam.sh dev-up
# http://localhost:3341 üzerinden test et

# 3) Yeni migration varsa development'ta uygula
./scripts/ortam.sh dev-migrate

# 4) Memnun kaldıysan production'a yükselt
./scripts/ortam.sh promote
#   - "PRODUCTION" yazarak onaylaman istenir
#   - production'ın ŞU ANKİ imajları otomatik ':rollback' etiketiyle yedeklenir
#   - production veritabanının otomatik yedeği alınır (backups/prod-pre-promote-*.sql.gz)
#   - production güncel koddan yeniden derlenip yeniden başlatılır
#   - bekleyen migration'ları hemen uygulamak isteyip istemediğin sorulur

# 5) Bir sorun çıkarsa hızlıca geri dön
./scripts/ortam.sh rollback
```

## `promote` içinde tam olarak ne oluyor?

1. Güncel git commit'i (ve commit edilmemiş değişiklik varsa uyarı) gösterilir.
2. `PRODUCTION` yazılarak onay istenir.
3. Bekleyen migration'ların derlemeden sonra uygulanıp uygulanmayacağı sorulur
   (soru, stdin'i tüketebilen `docker compose build` adımından önce sorulur).
4. **Rollback noktası** oluşturulur: production'da şu an çalışan `maliyetik-backend:latest`
   ve `maliyetik-frontend:latest` imajları `:rollback` etiketiyle işaretlenir (üzerine
   yazılır — yalnızca **son bir** geri dönüş noktası tutulur).
5. Production veritabanının tam yedeği alınır (`backups/prod-pre-promote-<tarih>.sql.gz`).
6. `docker compose build` ile production imajları güncel koddan yeniden derlenir.
7. `docker compose up -d` ile container'lar yeni imajla yeniden başlatılır.
8. Adım 3'te "evet" dendiyse migration'lar şimdi uygulanır (istemediysen sonra
   `prod-migrate` ile elle çalıştırabilirsin).

## `rollback` içinde tam olarak ne oluyor?

- `:rollback` etiketli bir imaj yoksa (hiç `promote` çalıştırılmamışsa) hata verip durur.
- `ROLLBACK` yazılarak onay istenir.
- `:rollback` etiketli imaj tekrar `:latest` olarak etiketlenir, `backend`/`frontend`
  container'ları `--force-recreate` ile bu imajla yeniden başlatılır. **Yeniden derleme
  yapılmaz** — bu yüzden çok hızlıdır (saniyeler içinde).
- **Veritabanı geri alınmaz.** Eğer promote sırasında veriyi bozan bir migration
  çalıştıysa, veritabanını da geri almak için ayrıca `restore-db prod <yedek-dosyası>`
  çalıştırman gerekir (`backups/` altındaki `prod-pre-promote-*.sql.gz` dosyalarından).

## Migration'lar neden ayrı bir mekanizma (`backend-migrate`) kullanıyor?

Production imajı yalnızca derlenmiş `dist/` çıktısını içerir; `src/` ve `ts-node` yoktur.
`npm run migration:run` ise `ts-node` ile `src/database/data-source.ts`'i çalıştırır.
Bu yüzden `backend/Dockerfile` içinde, `builder` aşamasını temel alan ayrı bir
`migrator` aşaması bulunur. `docker-compose.yml`'daki
`backend-migrate` servisi bu aşamayı kullanır ve `profiles: ["tools"]` sayesinde normal
`docker compose up` ile **başlamaz** — yalnızca `docker compose run --rm backend-migrate`
(script'in `dev-migrate` / `prod-migrate` / `promote` komutlarının içinde çağırdığı) ile
tek seferlik çalışır.

## Veritabanı yedekleri nerede tutulur?

`backups/` klasöründe (`.gitignore`'da). Düzenli yedek ve yedeklerin başka bir yere
kopyalanması kurulumu yapana bırakılmıştır; betik bunu otomatik yapmaz.

## Güvenlik notları

- `promote`, `rollback`, `prod-stop`, `restore-db` gibi geri dönüşü zor/riskli işlemler,
  her seferinde belirli bir kelimeyi elle yazmayı zorunlu kılan bir onay ister — yanlışlıkla
  Enter'a basmakla tetiklenmezler.
- `.env` ve `.env.development` hiçbir zaman git'e commit edilmez; yalnızca `.env.example`
  ve `.env.development.example` (placeholder değerlerle) commit edilir.
- Development ve production'ın GCS bucket'ının **farklı** olması önerilir
  (`.env.development.example` içinde not var) — aksi halde development'ta yüklenen
  evraklar production'ın gerçek dosya deposuna karışır.
