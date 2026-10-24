import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccountantAuthorization, AccountantProfile, TaxpayerProfile, User } from '../../database/entities';
import { AuthUser } from '../../common/types/auth-user';
import { AuthorizationStatus } from '../../shared/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../../infrastructure/mail/mail.service';

export const ACCOUNTANT_MESSAGE_TYPE = 'accountant_message';

/** Tek gönderimde ulaşılabilecek azami mükellef — kazara toplu gönderime karşı. */
const MAX_RECIPIENTS = 100;

export interface NotifyResult {
  sent: number;
  emailed: number;
  skipped: string[];
}

/**
 * Mali müşavirin mükellefine mesaj göndermesi.
 *
 * Yalnızca AKTİF yetkisi olan mükelleflere gönderilebilir — yetki listesi her gönderimde
 * yeniden doğrulanır, istemciden gelen id'lere güvenilmez. Mesaj panel bildirimi olarak
 * düşer; müşavir isterse e-posta da gönderir (mükellefin e-posta tercihi kapalıysa
 * e-posta atlanır, bildirim yine düşer).
 */
@Injectable()
export class AccountantNotifyService {
  private readonly logger = new Logger(AccountantNotifyService.name);

  constructor(
    @InjectRepository(AccountantAuthorization) private readonly auths: Repository<AccountantAuthorization>,
    @InjectRepository(AccountantProfile) private readonly accountants: Repository<AccountantProfile>,
    @InjectRepository(TaxpayerProfile) private readonly taxpayers: Repository<TaxpayerProfile>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async notify(
    user: AuthUser,
    taxpayerIds: string[],
    title: string,
    body: string,
    sendEmail: boolean,
  ): Promise<NotifyResult> {
    if (!user.accountantId) throw new ForbiddenException('Bu işlem yalnızca mali müşavirler içindir.');
    if (!taxpayerIds.length) throw new BadRequestException('En az bir mükellef seçmelisiniz.');
    if (taxpayerIds.length > MAX_RECIPIENTS) {
      throw new BadRequestException(`Tek seferde en fazla ${MAX_RECIPIENTS} mükellefe gönderilebilir.`);
    }

    // Yetki kontrolü sunucuda, her gönderimde yeniden: istemcinin gönderdiği id listesi
    // aktif yetkilerle KESİŞTİRİLİR; yetkisiz id sessizce düşer ve sonuçta raporlanır.
    const allowed = await this.auths.find({
      where: {
        accountantId: user.accountantId,
        taxpayerId: In(taxpayerIds),
        status: AuthorizationStatus.ACTIVE,
      },
    });
    const allowedIds = new Set(allowed.map((a) => String(a.taxpayerId)));
    const skipped = taxpayerIds.filter((id) => !allowedIds.has(String(id)));
    if (!allowedIds.size) throw new ForbiddenException('Seçilen mükelleflere gönderim yetkiniz yok.');

    const profiles = await this.taxpayers.find({ where: { id: In([...allowedIds]) } });
    const userIds = profiles.map((p) => p.userId);
    const recipients = await this.users.find({ where: { id: In(userIds) } });

    const accountant = await this.accountants.findOne({ where: { id: user.accountantId } });
    const senderName = accountant?.displayTitle || user.fullName || 'Mali müşaviriniz';

    await this.notifications.createForUsers(recipients.map((r) => r.id), {
      type: ACCOUNTANT_MESSAGE_TYPE,
      title,
      body,
      metadata: { from: senderName, accountantId: user.accountantId },
    });

    let emailed = 0;
    if (sendEmail) {
      for (const recipient of recipients) {
        // Kullanıcı evrak hareketi e-postalarını kapattıysa saygı gösterilir; panel
        // bildirimi yine düştüğü için mesaj kaybolmaz.
        if (recipient.uiPreferences?.emailDocumentActivity === false) continue;
        try {
          await this.mail.sendAccountantMessage(recipient.email, recipient.fullName, senderName, title, body);
          emailed += 1;
        } catch (err) {
          this.logger.error(`Müşavir mesajı e-postası gönderilemedi (user=${recipient.id}): ${(err as Error).message}`);
        }
      }
    }

    return { sent: recipients.length, emailed, skipped };
  }
}
