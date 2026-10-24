import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AccountantProfile, TaxpayerProfile, User } from '../../database/entities';
import { AuthUser } from '../../common/types/auth-user';
import { Role, UserStatus } from '../../shared/enums';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { optimizeIfPng } from '../../common/utils/image-optimizer';
import { ALLOWED_IMAGE_MIME_TYPES } from '../../common/utils/mime-allowlist';
import { sanitizeBio } from './bio-sanitizer';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UiPreferences } from '../../shared/ui-preferences';

/** Avatar imzalı URL ömrü — profil kartı/hesap sayfasında oturum boyunca yeterince taze kalır. */
const AVATAR_URL_TTL_SECONDS = 3600;

export interface OwnProfile {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  username: string | null;
  bio: string | null;
  isPublic: boolean;
  avatarUrl?: string;
  uiPreferences: UiPreferences | null;
  createdAt: Date;
  /** Yalnızca taxpayer rolünde dolu. */
  accountantCanViewQuota?: boolean;
  accountantCanViewAiCredits?: boolean;
}

export interface PublicProfile {
  username: string;
  fullName: string;
  role: Role;
  bio: string | null;
  avatarUrl?: string;
}

interface AvatarFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(TaxpayerProfile) private readonly taxpayers: Repository<TaxpayerProfile>,
    @InjectRepository(AccountantProfile) private readonly accountants: Repository<AccountantProfile>,
    private readonly storage: StorageService,
  ) {}

  /** Parola hash'i dahil (login için). */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /**
   * Başarılı girişte `last_login_at` damgasını günceller. Kolon baştan beri vardı ve
   * admin kullanıcı listesinde "son giriş" olarak GÖSTERİLİYORDU, ama hiçbir yerde
   * YAZILMIYORDU — yani sütun herkes için boş görünüyordu.
   */
  async markLoggedIn(userId: string): Promise<void> {
    // Saat damgası VERİTABANINA yazdırılıyor, uygulamadan gönderilmiyor: backend
    // konteyneri UTC, MySQL ise sistem saatiyle (Europe/Istanbul) çalışıyor ve
    // TypeORM `timezone: 'Z'` ile yazıyor. `new Date()` gönderilirse bu kolon,
    // yanındaki `created_at` ve `audit_logs.created_at` ile 3 saat kayık olur —
    // "son giriş" ile giriş denetim satırı yan yana konduğunda tutmaz.
    await this.users.update({ id: userId }, { lastLoginAt: () => 'CURRENT_TIMESTAMP' });
  }

  /** JWT payload'ından zenginleştirilmiş kimlik bağlamı (profil id'leri ile). */
  async buildAuthContext(user: Pick<User, 'id' | 'role' | 'email' | 'fullName' | 'username'>): Promise<AuthUser> {
    const ctx: AuthUser = { userId: user.id, role: user.role, email: user.email, fullName: user.fullName };

    if (user.role === Role.TAXPAYER) {
      const tp = await this.taxpayers.findOne({ where: { userId: user.id }, select: ['id'] });
      ctx.taxpayerId = tp?.id;
    } else if (user.role === Role.ACCOUNTANT) {
      const ac = await this.accountants.findOne({ where: { userId: user.id }, select: ['id'] });
      ctx.accountantId = ac?.id;
    }
    ctx.username = user.username ?? undefined;
    return ctx;
  }

  async getOwnProfile(userId: string): Promise<OwnProfile> {
    const user = await this.findByIdOrThrow(userId);
    return this.toOwnProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<OwnProfile> {
    const user = await this.findByIdOrThrow(userId);

    if (dto.username !== undefined) {
      const normalized = dto.username.toLowerCase();
      if (normalized !== user.username) {
        const clash = await this.users.findOne({ where: { username: normalized } });
        if (clash) throw new ConflictException('Bu kullanıcı adı zaten alınmış.');
        user.username = normalized;
      }
    }
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.bio !== undefined) user.bio = sanitizeBio(dto.bio);
    if (dto.isPublic !== undefined) user.isPublic = dto.isPublic;

    await this.users.save(user);

    if (dto.accountantCanViewQuota !== undefined || dto.accountantCanViewAiCredits !== undefined) {
      if (user.role !== Role.TAXPAYER) throw new ConflictException('Bu ayar yalnızca mükellef hesaplarında geçerlidir.');
      const profile = await this.taxpayers.findOne({ where: { userId } });
      if (profile) {
        if (dto.accountantCanViewQuota !== undefined) profile.accountantCanViewQuota = dto.accountantCanViewQuota;
        if (dto.accountantCanViewAiCredits !== undefined) profile.accountantCanViewAiCredits = dto.accountantCanViewAiCredits;
        await this.taxpayers.save(profile);
      }
    }

    return this.toOwnProfile(user);
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<OwnProfile> {
    const user = await this.findByIdOrThrow(userId);
    user.uiPreferences = { ...user.uiPreferences, ...dto };
    await this.users.save(user);
    return this.toOwnProfile(user);
  }

  async uploadAvatar(userId: string, file: AvatarFile): Promise<OwnProfile> {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new ConflictException('Yalnızca görsel dosyası (jpg, png, webp, heic) yüklenebilir.');
    }
    const user = await this.findByIdOrThrow(userId);
    const buffer = await optimizeIfPng(file.buffer, file.mimetype);
    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `avatars/${userId}/${randomUUID()}-${safeName}`;
    const uploaded = await this.storage.upload(path, buffer, file.mimetype);

    const oldPath = user.avatarPath;
    user.avatarPath = uploaded.path;
    await this.users.save(user);
    if (oldPath) await this.storage.delete(oldPath).catch(() => undefined);

    return this.toOwnProfile(user);
  }

  async getPublicProfile(username: string): Promise<PublicProfile> {
    const user = await this.users.findOne({ where: { username: username.toLowerCase() } });
    if (!user || !user.isPublic || user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Profil bulunamadı.');
    }
    return {
      username: user.username!,
      fullName: user.fullName,
      role: user.role,
      bio: user.bio ?? null,
      avatarUrl: await this.signedAvatarUrl(user.avatarPath),
    };
  }

  private async findByIdOrThrow(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    return user;
  }

  private async toOwnProfile(user: User): Promise<OwnProfile> {
    const profile: OwnProfile = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      username: user.username ?? null,
      bio: user.bio ?? null,
      isPublic: user.isPublic,
      avatarUrl: await this.signedAvatarUrl(user.avatarPath),
      uiPreferences: user.uiPreferences ?? null,
      createdAt: user.createdAt,
    };
    if (user.role === Role.TAXPAYER) {
      const tp = await this.taxpayers.findOne({ where: { userId: user.id } });
      if (tp) {
        profile.accountantCanViewQuota = tp.accountantCanViewQuota;
        profile.accountantCanViewAiCredits = tp.accountantCanViewAiCredits;
      }
    }
    return profile;
  }

  private signedAvatarUrl(path?: string): Promise<string | undefined> {
    return path ? this.storage.getSignedReadUrl(path, AVATAR_URL_TTL_SECONDS) : Promise.resolve(undefined);
  }
}
