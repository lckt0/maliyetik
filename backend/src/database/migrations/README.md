# Migrations

Şemanın kaynak-of-truth'u `docker/mysql/init/01_schema.sql` (+ `02_seed.sql`).
Docker ilk kalkışta bu SQL'i otomatik uygular.

Docker dışı ortamlar (CI, local) için TypeORM migration akışı:

```bash
# Entity'lerden fark üret (schema.sql ile aynı olmalı)
npm run migration:generate -- src/database/migrations/Init

# Uygula / geri al
npm run migration:run
npm run migration:revert
```

`synchronize` her ortamda kapalıdır — şema değişikliği yalnızca migration + `schema.sql`
güncellemesiyle yapılır (ikisi senkron tutulur).
