import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { User } from '../entities';
import { Role, UserStatus } from '../../shared/enums';

/**
 * İlk admin kullanıcısını ADMIN_EMAIL / ADMIN_PASSWORD env'lerinden oluşturur.
 * Parola hash'i burada üretilir; repoda tutulmaz. Idempotent — varsa atlar.
 *
 *   npm run seed
 */
async function run() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('ADMIN_EMAIL ve ADMIN_PASSWORD env değişkenleri gereklidir.');
    process.exit(1);
  }

  await AppDataSource.initialize();
  const users = AppDataSource.getRepository(User);

  const existing = await users.findOne({ where: { email } });
  if (existing) {
    console.log(`Admin zaten mevcut: ${email} — atlanıyor.`);
    await AppDataSource.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = users.create({
    email,
    passwordHash,
    fullName: 'Sistem Yöneticisi',
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    username: email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]+/g, '').slice(0, 30) || 'admin',
    emailVerifiedAt: new Date(),
  });
  await users.save(admin);

  console.log(`Admin oluşturuldu: ${email}`);
  await AppDataSource.destroy();
}

run().catch((err) => {
  console.error('Seed hatası:', err);
  process.exit(1);
});
