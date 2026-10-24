import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AccountantProfile, RefreshToken, TaxpayerProfile, User } from '../../database/entities';
import { AdminAuditAction, Role, UserStatus } from '../../shared/enums';
import { Cursor, Paginated } from '../../common/pagination/paginated';
import { UserActivationService } from '../users/user-activation.service';
import { AuditService } from '../audit/audit.service';
import { AdminListUsersQueryDto } from './dto/admin-list-users.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminChangeRoleDto } from './dto/admin-change-role.dto';

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  companyTitle: string | null;
  displayTitle: string | null;
  /** Yalnızca taxpayer rolünde dolu — taxpayer_profiles.vkn_tckn. */
  vknTckn: string | null;
}

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(TaxpayerProfile) private readonly taxpayers: Repository<TaxpayerProfile>,
    @InjectRepository(AccountantProfile) private readonly accountants: Repository<AccountantProfile>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activation: UserActivationService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminListUsersQueryDto): Promise<Paginated<AdminUserRow>> {
    const qb = this.users
      .createQueryBuilder('u')
      .leftJoin('taxpayer_profiles', 'tp', 'tp.user_id = u.id')
      .leftJoin('accountant_profiles', 'ap', 'ap.user_id = u.id')
      .select([
        'u.id AS id',
        'u.email AS email',
        'u.full_name AS fullName',
        'u.phone AS phone',
        'u.role AS role',
        'u.status AS status',
        'u.email_verified_at AS emailVerifiedAt',
        'u.created_at AS createdAt',
        'u.last_login_at AS lastLoginAt',
        'tp.company_title AS companyTitle',
        'tp.vkn_tckn AS vknTckn',
        'ap.display_title AS displayTitle',
      ])
      .where('u.deleted_at IS NULL');

    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    if (query.status) qb.andWhere('u.status = :status', { status: query.status });
    if (query.awaitingApproval) {
      qb.andWhere('u.status = :pending AND u.email_verified_at IS NOT NULL', { pending: UserStatus.PENDING });
    }
    if (query.search) qb.andWhere('(u.email LIKE :s OR u.full_name LIKE :s)', { s: `%${query.search}%` });

    if (query.page) {
      const total = await qb.clone().getCount();
      const items = await qb.orderBy('u.id', 'DESC').offset((query.page - 1) * query.limit).limit(query.limit).getRawMany<AdminUserRow>();
      return { items, nextCursor: null, limit: query.limit, total, page: query.page, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
    }

    if (query.cursor) qb.andWhere('u.id < :cid', { cid: Cursor.decode(query.cursor) });

    qb.orderBy('u.id', 'DESC').limit(query.limit + 1);

    const rows = await qb.getRawMany<AdminUserRow>();
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? Cursor.encode(String(items[items.length - 1].id)) : null;
    return { items, nextCursor, limit: query.limit };
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id }, relations: ['taxpayerProfile', 'accountantProfile'] });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    return user;
  }

  async update(id: string, dto: AdminUpdateUserDto): Promise<User> {
    const user = await this.findOrThrow(id);
    if (dto.email !== undefined && dto.email !== user.email) {
      const clash = await this.users.findOne({ where: { email: dto.email } });
      if (clash) throw new ConflictException('Bu e-posta adresi zaten kullanılıyor.');
      user.email = dto.email;
    }
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.isPublic !== undefined) user.isPublic = dto.isPublic;

    if (dto.vknTckn !== undefined || dto.companyTitle !== undefined) {
      if (user.role !== Role.TAXPAYER) throw new BadRequestException('VKN/TCKN ve unvan yalnızca mükellef hesaplarında düzenlenebilir.');
      const profile = await this.taxpayers.findOne({ where: { userId: id } });
      if (!profile) throw new NotFoundException('Mükellef profili bulunamadı.');
      if (dto.vknTckn !== undefined && dto.vknTckn !== profile.vknTckn) {
        const clash = await this.taxpayers.findOne({ where: { vknTckn: dto.vknTckn } });
        if (clash) throw new ConflictException('Bu VKN/TCKN başka bir mükellefte kayıtlı.');
        profile.vknTckn = dto.vknTckn;
      }
      if (dto.companyTitle !== undefined) profile.companyTitle = dto.companyTitle;
      await this.taxpayers.save(profile);
    }

    return this.users.save(user);
  }

  /** Kullanıcının tüm yürürlükteki oturumlarını (refresh token) kapatır. */
  private async revokeSessions(userId: string): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async setStatus(id: string, status: UserStatus, actorUserId: string): Promise<User> {
    const user = await this.findOrThrow(id);
    const previousStatus = user.status;
    user.status = status;
    const saved = await this.users.save(user);
    // Askıya alma ANINDA geçerli olmalı: yalnızca durumu yazmak yetmiyordu, kullanıcının
    // yürürlükteki refresh token'ı yenilenmeye devam ettiği için erişimi kesilmiyordu.
    // (Yenilemede durum kontrolü de eklendi — bkz. AuthService.refresh; bu, kalan kısa
    // ömürlü access token dışında erişimi hemen kapatır.)
    if (status !== UserStatus.ACTIVE) await this.revokeSessions(id);
    await this.audit.log({
      actorUserId,
      action: AdminAuditAction.USER_STATUS_CHANGED,
      entityType: 'user',
      entityId: id,
      metadata: { from: previousStatus, to: status },
    });
    return saved;
  }

  /** Role değişimi, hedef role'ün profil satırı yoksa transaction içinde oluşturur; eski profil satırı dokunulmadan kalır. */
  async changeRole(id: string, dto: AdminChangeRoleDto, actorUserId: string): Promise<User> {
    const previousRole = await this.dataSource.transaction(async (tx) => {
      const user = await tx.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
      if (user.role === dto.role) throw new BadRequestException('Kullanıcı zaten bu role sahip.');
      const from = user.role;

      user.role = dto.role;
      await tx.save(user);

      if (dto.role === Role.TAXPAYER) {
        const existing = await tx.findOne(TaxpayerProfile, { where: { userId: user.id } });
        if (!existing) {
          const clash = await tx.findOne(TaxpayerProfile, { where: { vknTckn: dto.vknTckn } });
          if (clash) throw new ConflictException('Bu VKN/TCKN zaten kayıtlı.');
          await tx.save(
            tx.create(TaxpayerProfile, {
              userId: user.id,
              companyTitle: dto.companyTitle!,
              vknTckn: dto.vknTckn!,
              taxOffice: dto.taxOffice,
            }),
          );
        }
      } else if (dto.role === Role.ACCOUNTANT) {
        const existing = await tx.findOne(AccountantProfile, { where: { userId: user.id } });
        if (!existing) {
          await tx.save(
            tx.create(AccountantProfile, {
              userId: user.id,
              displayTitle: dto.displayTitle!,
              licenseNo: dto.licenseNo,
              officeName: dto.officeName,
              city: dto.city,
            }),
          );
        }
      }

      return from;
    });
    // Rol değişince eski roldeki yetkilerle basılmış oturumlar kapatılır — kullanıcı
    // yeniden giriş yaptığında yeni rolüyle token alır.
    await this.revokeSessions(id);
    await this.audit.log({
      actorUserId,
      action: AdminAuditAction.USER_ROLE_CHANGED,
      entityType: 'user',
      entityId: id,
      metadata: { from: previousRole, to: dto.role },
    });
    return this.findOrThrow(id);
  }

  async remove(id: string, actorUserId: string, action: AdminAuditAction = AdminAuditAction.USER_REMOVED): Promise<void> {
    const user = await this.findOrThrow(id);
    user.status = UserStatus.SUSPENDED;
    await this.users.save(user);
    await this.users.softDelete(id);
    await this.audit.log({ actorUserId, action, entityType: 'user', entityId: id });
  }

  async approve(id: string, actorUserId: string): Promise<void> {
    const user = await this.findOrThrow(id);
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException('Kullanıcı onay bekleyen durumda değil.');
    }
    await this.activation.activate(id);
    await this.audit.log({ actorUserId, action: AdminAuditAction.USER_APPROVED, entityType: 'user', entityId: id });
  }

  async approveBulk(ids: string[], actorUserId: string): Promise<{ approved: string[]; failed: string[] }> {
    const results = await Promise.allSettled(ids.map((id) => this.approve(id, actorUserId)));
    const approved: string[] = [];
    const failed: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') approved.push(ids[i]);
      else failed.push(ids[i]);
    });
    return { approved, failed };
  }

  /** Onay bekleyen bir hesabı reddetmek, hiç aktif olmadığı için silmekle aynı işlemdir. */
  reject(id: string, actorUserId: string): Promise<void> {
    return this.remove(id, actorUserId, AdminAuditAction.USER_REJECTED);
  }

  private async findOrThrow(id: string): Promise<User> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    return user;
  }
}
