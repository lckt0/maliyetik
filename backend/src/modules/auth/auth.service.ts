import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { AccountantProfile, EmailVerificationToken, LegalConsent, PasswordResetToken, RefreshToken, TaxpayerProfile, User } from '../../database/entities';
import { UsersService } from '../users/users.service';
import { UserActivationService } from '../users/user-activation.service';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { Configuration } from '../../config/configuration';
import { AuthUser } from '../../common/types/auth-user';
import { AccessTokenPayload } from './jwt.strategy';
import { AccessAuditAction, AdminAuditAction, Role, UserStatus } from '../../shared/enums';
import { ACIK_RIZA_PAZARLAMA, YASAL_METIN_SURUMU, ZORUNLU_ONAY_METINLERI } from '../../shared/legal';
import { normalizeIp } from '../settings/maintenance-check.util';
import { RegisterDto } from './dto/register.dto';
import { AuditService } from '../audit/audit.service';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
/** Bcrypt maliyet faktörü — run-seed.ts ile aynı. */
const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly activation: UserActivationService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Configuration, true>,
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(EmailVerificationToken) private readonly verificationTokens: Repository<EmailVerificationToken>,
    @InjectRepository(PasswordResetToken) private readonly passwordResetTokens: Repository<PasswordResetToken>,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, clientType?: string): Promise<TokenPair & { user: AuthUser }> {
    const user = await this.users.findByEmailWithPassword(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('E-posta veya parola hatalı.');
    }
    if (user.status !== UserStatus.ACTIVE) {
      if (user.status === UserStatus.PENDING && !user.emailVerifiedAt) {
        throw new UnauthorizedException('E-posta adresinizi doğrulamanız gerekiyor.');
      }
      if (user.status === UserStatus.PENDING) {
        throw new UnauthorizedException('Hesabınız yönetici onayını bekliyor.');
      }
      throw new UnauthorizedException('Hesabınız devre dışı bırakılmış.');
    }
    this.assertMobileAccess(user.role, clientType);

    const ctx = await this.users.buildAuthContext(user);
    const tokens = await this.issueTokens(ctx);
    await this.recordLogin(ctx, clientType);
    return { ...tokens, user: ctx };
  }

  /**
   * Girişin izini bırakır. İki ayrı şey yazılıyor, çünkü iki ayrı soruya bakıyorlar:
   *  - `last_login_at`: "bu hesap en son ne zaman uğradı" (admin listesinde görünür).
   *  - denetim satırı: "hangi günlerde, hangi istemciden uğradı" — kullanım
   *    sürekliliğini yalnızca bu gösterir ve geriye dönük üretilemez.
   *
   * `refresh` bilerek kaydedilmiyor: token yenileme kullanıcı eylemi değil, sayıları
   * şişirir.
   *
   * Kayıt tutulamazsa giriş yine de başarılı sayılır — ölçüm, hizmetin önüne geçmez.
   */
  private async recordLogin(ctx: AuthUser, clientType?: string): Promise<void> {
    try {
      await this.users.markLoggedIn(ctx.userId);
      await this.audit.log({
        actorUserId: ctx.userId,
        action: AccessAuditAction.LOGIN,
        entityType: 'user',
        entityId: ctx.userId,
        metadata: { role: ctx.role, client: clientType === 'mobile' ? 'mobile' : 'web' },
      });
    } catch (err) {
      this.logger.warn(`Giriş izi yazılamadı (${ctx.userId}): ${(err as Error).message}`);
    }
  }

  /**
   * Mobil uygulamadan (`x-client-type: mobile`) gelen isteklerde erişimi doğrular.
   * Header yoksa masaüstü akışıdır ve hiçbir kısıt uygulanmaz.
   *
   * Erişim rol bazında admin panelindeki anahtarlarla yönetilir (Sistem Ayarları →
   * Mobil Uygulama). Üç rol de mobil uygulamayı kullanabilir; bir rolün anahtarı
   * kapatılırsa o roldeki hesaplar mobilde giriş yapamaz — masaüstü paneli etkilenmez.
   *
   * Hem `login` hem `refresh` bu metodu çağırır: aksi halde masaüstünde alınmış bir
   * refresh token'ı mobil istemcide yenilenmeye devam eder ve anahtar delinirdi.
   */
  private assertMobileAccess(role: Role, clientType?: string): void {
    if (clientType !== 'mobile') return;

    const s = this.settings.getCached();
    const enabled = role === Role.TAXPAYER ? s.taxpayerMobileAppEnabled
      : role === Role.ACCOUNTANT ? s.accountantMobileAppEnabled
      : s.adminMobileAppEnabled;

    if (!enabled) {
      const roleLabel = role === Role.TAXPAYER ? 'Mükellef'
        : role === Role.ACCOUNTANT ? 'Mali müşavir' : 'Admin';
      throw new ForbiddenException({
        code: 'MOBILE_ACCESS_DISABLED',
        message: `${roleLabel} hesapları için mobil uygulama erişimi kapatılmış. `
          + `${new URL(this.config.get('appUrl', { infer: true })).host} adresinden web panelini kullanabilirsiniz.`,
      });
    }
  }

  /**
   * Admin, hedef kullanıcının hesabına destek/hata ayıklama amacıyla geçici olarak geçer.
   * Adminler birbirini impersonate edemez (yetki yükseltme zinciri riski). İşlem denetim
   * günlüğüne yazılır — frontend, admin oturumunu geri dönüş için kendi tarafında saklar.
   */
  async impersonate(targetUserId: string, actorAdminId: string): Promise<TokenPair & { user: AuthUser }> {
    const target = await this.users.findById(targetUserId);
    if (!target) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (target.role === Role.ADMIN) throw new ForbiddenException('Bir admin hesabına geçiş yapılamaz.');

    const ctx = await this.users.buildAuthContext(target);
    const tokens = await this.issueTokens(ctx);
    await this.audit.log({
      actorUserId: actorAdminId,
      action: AdminAuditAction.USER_IMPERSONATED,
      entityType: 'user',
      entityId: targetUserId,
    });
    return { ...tokens, user: ctx };
  }

  /** Admin, hedef kullanıcının şifresini doğrudan belirler. Tüm oturumları (refresh token) iptal eder — kullanıcı yeniden giriş yapmalı. */
  async adminSetPassword(targetUserId: string, newPassword: string, actorAdminId: string): Promise<void> {
    const userRepo = this.dataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: targetUserId });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await userRepo.save(user);
    await this.refreshTokens.update({ userId: user.id }, { revokedAt: new Date() });
    await this.audit.log({
      actorUserId: actorAdminId,
      action: AdminAuditAction.USER_PASSWORD_CHANGED,
      entityType: 'user',
      entityId: targetUserId,
    });
  }

  /** Admin, hedef kullanıcı için şifre sıfırlama bağlantısı üretir — e-posta gönderilmez, admin bağlantıyı kendisi paylaşır. */
  async adminCreatePasswordResetLink(targetUserId: string, actorAdminId: string): Promise<{ url: string }> {
    const user = await this.dataSource.getRepository(User).findOneBy({ id: targetUserId });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');

    const rawToken = randomBytes(32).toString('hex');
    await this.passwordResetTokens.save(
      this.passwordResetTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      }),
    );
    await this.audit.log({
      actorUserId: actorAdminId,
      action: AdminAuditAction.USER_PASSWORD_RESET_LINK_CREATED,
      entityType: 'user',
      entityId: targetUserId,
    });

    const appUrl = this.config.get('appUrl', { infer: true });
    return { url: `${appUrl}/sifre-sifirla?token=${rawToken}` };
  }

  /**
   * Kullanıcının kendi başına şifre sıfırlama talebi.
   *
   * HER DURUMDA sessizce başarılı döner: yanıtın "bu e-posta kayıtlı" / "kayıtlı değil"
   * ayrımını yapması, sistemi bir kullanıcı numaralandırma (enumeration) aracına çevirirdi.
   * E-posta yalnızca gerçekten var olan ve askıya alınmamış bir hesap için gönderilir.
   *
   * Askıya alınmış hesaba bilerek gönderilmez: parolayı değiştirmek girişe yaramaz,
   * gönderilen bağlantı yalnızca kafa karışıklığı yaratır.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.dataSource.getRepository(User).findOne({ where: { email } });
    if (!user || user.status === UserStatus.SUSPENDED) return;

    const rawToken = randomBytes(32).toString('hex');
    await this.passwordResetTokens.save(
      this.passwordResetTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      }),
    );

    const appUrl = this.config.get('appUrl', { infer: true });
    try {
      await this.mail.sendPasswordResetEmail(user.email, user.fullName, `${appUrl}/sifre-sifirla?token=${rawToken}`);
    } catch (err) {
      // E-posta sağlayıcısı hata verdiyse kullanıcıya yansıtılmaz (yine "gönderildi" denir),
      // ama sessizce yutulmaz — operasyonun görebilmesi için loglanır.
      this.logger.error(`Şifre sıfırlama e-postası gönderilemedi (user=${user.id}): ${(err as Error).message}`);
    }
  }

  /** Şifre sıfırlama bağlantısındaki token'ı tüketir ve yeni şifreyi kaydeder. Tüm oturumlar iptal edilir. */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.passwordResetTokens.findOne({ where: { tokenHash } });
    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Şifre sıfırlama bağlantısının süresi dolmuş veya geçersiz.');
    }

    record.consumedAt = new Date();
    await this.passwordResetTokens.save(record);

    const userRepo = this.dataSource.getRepository(User);
    const user = await userRepo.findOneByOrFail({ id: record.userId });
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await userRepo.save(user);
    await this.refreshTokens.update({ userId: user.id }, { revokedAt: new Date() });
  }

  /** Hesap oluşturur (PENDING, doğrulanmamış) ve doğrulama e-postası gönderir. Giriş yapmaz — hesap henüz kullanılabilir değil. */
  async register(dto: RegisterDto, ip?: string, userAgent?: string): Promise<void> {
    if (!this.settings.getCached().registrationEnabled) {
      throw new ForbiddenException('Yeni kayıtlar şu anda kapalı.');
    }

    const emailClash = await this.dataSource.getRepository(User).findOne({ where: { email: dto.email } });
    if (emailClash) throw new ConflictException('Bu e-posta adresi zaten kullanılıyor.');

    if (dto.role === Role.TAXPAYER) {
      const vknClash = await this.dataSource.getRepository(TaxpayerProfile).findOne({ where: { vknTckn: dto.vknTckn } });
      if (vknClash) throw new ConflictException('Bu VKN/TCKN zaten kayıtlı.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const user = await this.dataSource.transaction(async (tx) => {
      const newUser = await tx.save(
        tx.create(User, {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone,
          role: dto.role,
          status: UserStatus.PENDING,
        }),
      );

      if (dto.role === Role.TAXPAYER) {
        await tx.save(
          tx.create(TaxpayerProfile, {
            userId: newUser.id,
            companyTitle: dto.companyTitle!,
            vknTckn: dto.vknTckn!,
            taxOffice: dto.taxOffice,
            address: dto.address,
          }),
        );
      } else {
        await tx.save(
          tx.create(AccountantProfile, {
            userId: newUser.id,
            displayTitle: dto.displayTitle!,
            licenseNo: dto.licenseNo,
            officeName: dto.officeName,
            city: dto.city,
          }),
        );
      }

      // Onay kanıtı, kullanıcı kaydıyla AYNI işlemde yazılır: kayıt olup onayı
      // yazılmamış bir kullanıcı kalmasın (ispat yükü bizde).
      const onaylar = [...ZORUNLU_ONAY_METINLERI.map((d) => d as string)];
      if (dto.marketingConsent) onaylar.push(ACIK_RIZA_PAZARLAMA);
      for (const document of onaylar) {
        await tx.save(
          tx.create(LegalConsent, {
            userId: newUser.id,
            document,
            version: YASAL_METIN_SURUMU,
            ip: ip ? normalizeIp(ip).slice(0, 45) : undefined,
            userAgent: userAgent?.slice(0, 255),
          }),
        );
      }

      return newUser;
    });

    await this.issueVerificationEmail(user);
  }

  /**
   * Token'ı tüketir; ilgili role için canlı (snapshot değil) onay ayarı gerekmiyorsa
   * hesabı hemen aktive edip oturum açar, gerekiyorsa admin onay kuyruğunda bırakır.
   */
  async verifyEmail(rawToken: string): Promise<
    { activated: true; accessToken: string; refreshToken: string; user: AuthUser } | { activated: false }
  > {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.verificationTokens.findOne({ where: { tokenHash } });
    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Doğrulama bağlantısının süresi dolmuş veya geçersiz.');
    }

    record.consumedAt = new Date();
    await this.verificationTokens.save(record);

    const user = await this.dataSource.getRepository(User).findOneByOrFail({ id: record.userId });
    user.emailVerifiedAt = new Date();
    await this.dataSource.getRepository(User).save(user);

    const s = this.settings.getCached();
    const approvalRequired = user.role === Role.TAXPAYER ? s.taxpayerApprovalRequired : s.accountantApprovalRequired;
    if (approvalRequired) {
      return { activated: false };
    }

    await this.activation.activate(user.id);
    const ctx = await this.users.buildAuthContext(user);
    const tokens = await this.issueTokens(ctx);
    return { activated: true, ...tokens, user: ctx };
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.dataSource.getRepository(User).findOne({ where: { email } });
    if (!user || user.status !== UserStatus.PENDING || user.emailVerifiedAt) return;

    const recent = await this.verificationTokens.findOne({
      where: { userId: user.id, createdAt: MoreThan(new Date(Date.now() - VERIFICATION_RESEND_COOLDOWN_MS)) },
      order: { createdAt: 'DESC' },
    });
    if (recent) return;

    await this.issueVerificationEmail(user);
  }

  async refresh(refreshToken: string, clientType?: string): Promise<TokenPair> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(refreshToken, {
        secret: this.config.get('jwt.refreshSecret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Geçersiz oturum.');
    }

    const hash = this.hashToken(refreshToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash: hash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Oturum süresi doldu.');
    }

    // Bağlam token'ın İÇİNDEN değil, veritabanından yeniden kurulur.
    //
    // Önceden rol/mükellef bilgisi doğrudan eski token'ın payload'ından kopyalanıyordu;
    // bu iki gerçek soruna yol açıyordu:
    //  1) Askıya alınan kullanıcı çıkış yapmıyordu — refresh token'ı sonsuza dek
    //     yenilenip tam erişim vermeye devam ediyordu.
    //  2) Rolü değiştirilen kullanıcı ESKİ rolüyle token basmayı sürdürüyordu
    //     (müşavirlikten mükellefliğe alınan biri müşavir yetkilerini koruyordu).
    // Artık her yenilemede kullanıcı okunur, durumu doğrulanır ve rol/profil
    // bağlamı güncel hâliyle üretilir.
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Oturum geçersiz.');
    if (user.status !== UserStatus.ACTIVE) {
      // Bu oturuma ait tüm token'lar da kapatılır; kullanıcı sessizce erişmeye devam etmesin.
      await this.refreshTokens.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
      throw new UnauthorizedException('Hesabınız devre dışı bırakılmış.');
    }
    this.assertMobileAccess(user.role, clientType);

    // Rotasyon: eskisini iptal et, yenisini ver.
    stored.revokedAt = new Date();
    await this.refreshTokens.save(stored);

    const ctx = await this.users.buildAuthContext(user);
    return this.issueTokens(ctx);
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = this.hashToken(refreshToken);
    await this.refreshTokens.update({ tokenHash: hash }, { revokedAt: new Date() });
  }

  private async issueVerificationEmail(user: User): Promise<void> {
    const rawToken = randomBytes(32).toString('hex');
    await this.verificationTokens.save(
      this.verificationTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      }),
    );
    const appUrl = this.config.get('appUrl', { infer: true });
    const verifyUrl = `${appUrl}/dogrula?token=${rawToken}`;
    await this.mail.sendVerificationEmail(user.email, user.fullName, verifyUrl);
  }

  private async issueTokens(ctx: AuthUser): Promise<TokenPair> {
    const jwtCfg = this.config.get('jwt', { infer: true });
    const payload: AccessTokenPayload = {
      sub: ctx.userId,
      role: ctx.role,
      tid: ctx.taxpayerId,
      aid: ctx.accountantId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: jwtCfg.accessSecret,
      expiresIn: jwtCfg.accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: jwtCfg.refreshSecret,
      expiresIn: jwtCfg.refreshTtl,
      // jti: iat alone (1s çözünürlük) aynı saniyede issueTokens() iki kez çağrılırsa
      // (ör. login'in hemen ardından refresh) birebir aynı imzalı token üretir —
      // refresh_tokens.token_hash UNIQUE kısıtına çarpıp 500'e düşüyordu.
      jwtid: randomBytes(16).toString('hex'),
    });

    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: ctx.userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + jwtCfg.refreshTtl * 1000),
      }),
    );

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
