# Maliyetik

**English** · [Türkçe](README.tr.md)

A self-hosted financial document management system for Turkish taxpayers and their
accountants. Invoices, Z-reports, receipts, bank statements and company documents are archived
with fields specific to each document type, and the taxpayer and the accountant work on the
same archive together.

![Accountant dashboard](docs/screenshots/musavir-dash.png)

> **A note before you start:** Maliyetik was originally built for my own setup and daily use, and later shared in case it helps someone else. It reflects my own hardware, tools and preferences, so it may not fit every system or workflow. Issues and suggestions are welcome, but please keep that in mind.

**Who it is for.** Maliyetik is built around the Turkish tax system: its document types, VAT
rules, legal templates and accounting integration are Turkish, and **the user interface is in
Turkish only**. Outside Turkey it is mostly useful as a reference codebase. A few terms that
appear throughout:

- **Mükellef**: a taxpayer, i.e. the business or person whose documents are archived.
- **Mali müşavir**: a licensed Turkish accountant and tax advisor (similar to a CPA) who keeps
  the books for taxpayers.
- **VKN** (*vergi kimlik numarası*): the Turkish tax identification number.
- **Z-report** (*Z-raporu*): the end-of-day report printed by a cash register, which is an
  accounting document in Turkey. The *Mali Hafıza* (fiscal memory) report is the cash
  register's longer period summary.
- **Luca**: an accounting software package widely used by Turkish accountants.

## Features

- **Three roles:** Admin, Taxpayer (*Mükellef*) and Accountant (*Mali Müşavir*). An accountant
  can only access the documents of taxpayers who have given them active authorization; a
  taxpayer can have at most one active accountant at a time.
- **Document archive:** e-Invoice (*e-Fatura*) and e-Archive invoice (*e-Arşiv*, the two
  Turkish electronic invoice systems), Z-report, collection/payment receipts, cheques, bank
  statements and company documents (signature circular, tax certificate…). Each type has its
  own field schema; filter by type, date, document number, amount and VKN.
- **Document digitization:** the fields of an uploaded document are filled in by hand or,
  optionally, automatically with Google Gemini (splitting a PDF that contains several
  invoices, generating Z-reports from a fiscal memory report).
- **VAT calculation:** total and carried-forward VAT for the selected period, by document type.
- **Luca integration:** import e-Invoices/e-Archive invoices from a Luca zip archive, and
  export Z-report vouchers to Luca.
- **Duplicate detection, document history, trash.**
- **Mobile app (PWA):** scan and upload documents with the camera under `/app/`.
- **Quotas and subscriptions:** document quota, AI credits, subscription plans; `mock`, iyzico
  or Shopier as the payment provider (the latter two are Turkish payment services).
- **Administration:** user approval, quota/credit allocation, announcements, audit log,
  maintenance mode, infrastructure cost ledger.
- **Public tools:** calculators for VAT, loans, *desi* (volumetric shipping weight),
  withholding tax and income tax.
- **Legal text templates:** KVKK (the Turkish personal data protection law) privacy notice,
  privacy policy, terms of use, distance sales agreement and so on (`frontend/src/legal/`).
  Company details come as placeholders; until they are filled in, the legal pages show a
  "draft" banner.

## Screenshots

| Taxpayer — My documents | Taxpayer — VAT calculation |
|---|---|
| ![My documents](docs/screenshots/mukellef-evraklar.png) | ![VAT calculation](docs/screenshots/mukellef-kdv.png) |

| Admin panel (dark theme) | Landing page |
|---|---|
| ![Admin](docs/screenshots/admin-dash.png) | ![Landing page](docs/screenshots/landing.png) |

<img src="docs/screenshots/mobil-ana.png" alt="Mobile app" width="260">

All people, companies and documents in the screenshots are sample data.

## Architecture

| Service | Technology | Description |
|---|---|---|
| `frontend` | React 18 (Vite) + Nginx | Desktop panel (`/`) and mobile PWA (`/app/`); forwards `/api` requests to the backend |
| `backend` | NestJS 10 + TypeScript, TypeORM | REST API (`/api/v1`), scheduled jobs, PDF generation (Chromium) |
| `mysql` | MySQL 8.4 | The schema is loaded from `docker/mysql/init` on first start |
| `redis` | Redis 7 | Cache and BullMQ queue |
| — | Google Cloud Storage | Document files (served through signed URLs) |

- Only `frontend` exposes a port; MySQL, Redis and the backend stay on the internal network.
- Backend layers: `controller → service → repository (TypeORM) → entity`.
- Authentication: JWT access + refresh tokens (rotated, stored hashed).
- Document metadata is kept in the `documents.metadata` JSON column; canonical fields
  (`meta_amount`, `meta_doc_no`, `meta_tax_id`…) are extracted into indexed
  `GENERATED STORED` columns.

```
maliyetik/
├─ docker-compose.yml
├─ docker/mysql/init/   # 01_schema.sql, 02_seed.sql (document types, quota packages)
├─ backend/             # NestJS API — src/{config,common,database,infrastructure,modules,shared}
├─ frontend/            # React SPA + mobile PWA
├─ scripts/ortam.sh     # optional: run development and production stacks side by side
└─ docs/
```

## Installation

Requirements: Docker and Docker Compose v2. Uploading documents requires a Google Cloud
Storage bucket and a service account.

### Docker Compose

```bash
# 0) Get the code
git clone https://github.com/lckt0/maliyetik.git
cd maliyetik

# 1) Environment variables
cp .env.example .env
# Fill in the passwords, JWT secrets and GCS details in .env.
#   openssl rand -hex 32                 # to generate a JWT secret
#   base64 -w0 service-account.json      # for GCS_CREDENTIALS_B64

# 2) Build and start
docker compose up -d --build

# 3) Apply the database migrations
docker compose --profile tools run --rm backend-migrate

# 4) Create the first admin user (ADMIN_EMAIL / ADMIN_PASSWORD)
docker compose exec backend npm run seed:prod
```

The app is served at `http://localhost:3340` (`FRONTEND_HOST_PORT`). By default the port is
bound to `127.0.0.1` only; in production, put a TLS-terminating reverse proxy (Nginx, Caddy,
Traefik…) in front of it and set `APP_URL` / `CORS_ORIGINS` to the public address. Camera
scanning in the mobile app only works over HTTPS.

A working SMTP server is required, because a verification email is sent on sign-up. New
accounts can be approved from the admin panel.

### Updating

```bash
git pull
docker compose up -d --build
docker compose --profile tools run --rm backend-migrate
```

### Development without Docker

Assuming MySQL 8 and Redis 7 are running:

```bash
# Backend
cd backend
npm ci
# Set DB_HOST, DB_PORT, REDIS_HOST ... in the environment (see .env.example)
npm run migration:run
npm run seed
npm run start:dev          # http://localhost:3000/api/v1

# Frontend
cd frontend
npm ci
npm run dev                # http://localhost:5173
```

The Vite dev server does not forward `/api` requests on its own; set `VITE_API_BASE_URL` to
the backend address (`http://localhost:3000/api/v1`) and add `http://localhost:5173` to
`CORS_ORIGINS`.

To run a separate development stack and production stack on the same machine, see
[docs/ortam-yonetimi.md](docs/ortam-yonetimi.md) (in Turkish).

## Environment variables

The full list with descriptions is in [.env.example](.env.example).

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | yes | Public address of the app (links in emails, file URLs) |
| `CORS_ORIGINS` | — | Comma-separated list of allowed origins |
| `FRONTEND_BIND`, `FRONTEND_HOST_PORT` | — | Address/port the frontend listens on, on the host (default `127.0.0.1:3340`) |
| `VITE_API_BASE_URL` | — | API root; default `/api/v1`, since the frontend forwards from the same origin |
| `VITE_SITE_URL` | — | Address for canonical/og tags and the sitemap (falls back to `APP_URL`) |
| `VITE_SUPPORT_EMAIL` | — | Support address on the subscription page (falls back to `destek@<domain>`) |
| `DB_ROOT_PASSWORD`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | yes | MySQL |
| `REDIS_PASSWORD` | yes | Redis password |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | yes | Email verification and password reset |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | At least 16 characters; `openssl rand -hex 32` |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | — | Seconds (default 900 / 1209600) |
| `GCS_PROJECT_ID`, `GCS_BUCKET`, `GCS_CREDENTIALS_B64` | yes | Google Cloud Storage bucket for document files |
| `MAX_UPLOAD_MB` | — | Upload limit (default 50) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first install | First admin, created with `npm run seed:prod` |
| `GEMINI_API_KEY` | — | Google Gemini key for the AI features; when empty, these features are off |
| `GEMINI_MODEL_CHEAP`, `GEMINI_MODEL_LIGHT`, `GEMINI_MODEL_ADVANCED`, `GEMINI_CONFIDENCE_THRESHOLD` | — | Model selection and confidence threshold |
| `PAYMENT_PROVIDER` | — | `mock` (default, no real payments), `iyzico` or `shopier` |
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` | — | iyzico keys |
| `SHOPIER_API_KEY`, `SHOPIER_API_SECRET`, `SHOPIER_WEBSITE_INDEX` | — | Shopier keys |
| `ENFORCE_SEAT_LIMITS` | — | Whether to enforce the taxpayer limit in accountant plans (default `false`) |
| `GCP_BILLING_*`, `BREVO_API_KEY` | — | Live data for the Admin > Infrastructure Costs page |
| `TZ` | — | Time zone (default `Europe/Istanbul`) |

### AI features (optional)

When `GEMINI_API_KEY` is set, document digitization (reading the fields from an image or PDF),
splitting PDFs with several invoices, reading fiscal memory reports, and natural-language
search/summaries are enabled. The key is only used by the backend and never sent to the
client. The features can also be turned off per role in the admin panel; digitization uses up
AI credits per user.

## Database

- Schema: [docker/mysql/init/01_schema.sql](docker/mysql/init/01_schema.sql), reference data:
  [02_seed.sql](docker/mysql/init/02_seed.sql). These files are only loaded on first start,
  while the database is empty; later schema changes come as TypeORM migrations under
  `backend/src/database/migrations`.
- TypeORM `synchronize` is off; the schema only changes through SQL/migrations.
- To take a backup: `docker compose exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"' | gzip > yedek.sql.gz`

## Key API endpoints (`/api/v1`)

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/auth/login` `/auth/refresh` `/auth/logout` `/auth/register` | — | Authentication |
| GET  | `/document-types?category=` | all | Types + dynamic form schema |
| POST | `/documents` (multipart) | taxpayer/accountant | Upload a document (uses quota) |
| GET  | `/documents?documentTypeId=&dateFrom=&amountMin=&taxId=` | all | Type-specific listing |
| GET/DELETE | `/documents/:id` | all | Details (signed URL) / delete |
| GET/POST/DELETE | `/company-documents` | taxpayer/accountant | Company documents (do not use quota) |
| POST | `/authorizations/request` `/:id/accept` `/:id/revoke` | taxpayer/accountant | Accountant authorization |
| GET  | `/quota/me` | taxpayer | Quota summary |
| POST | `/admin/quota/grant` | admin | Manual quota allocation |
| GET  | `/health` | — | Health and version info |

## Uninstallation

Run these commands in the repository directory.

```bash
docker compose down                  # removes the containers and network, keeps the data
docker compose down -v               # also deletes the database and Redis volumes (cannot be undone)
docker compose down -v --rmi local   # also deletes the built backend/frontend images
```

If you put a reverse proxy in front of it, remove the site/server entry you added for
Maliyetik there. Once everything is removed, you can delete the repository directory (together
with its `.env` file).

To delete the data as well (optional): `-v` deletes the database and Redis; the document files
in the GCS bucket have to be deleted separately, from the Google Cloud Console or with
`gcloud storage rm "gs://<bucket-name>/**"`.

## License

[MIT](LICENSE)
