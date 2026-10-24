import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Configuration } from '../../config/configuration';
import { formatDateTimeTr } from '../../shared/format-date';

/** SMTP tabanlı e-posta gönderimi (şu an Brevo relay, sağlayıcıdan bağımsız). */
@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(private readonly config: ConfigService<Configuration, true>) {}

  onModuleInit(): void {
    const smtp = this.config.get('smtp', { infer: true });
    this.from = smtp.from;
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
  }

  async sendVerificationEmail(to: string, fullName: string, verifyUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Maliyetik — E-posta adresinizi doğrulayın',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">
          <h2 style="color:#2563eb">Maliyetik</h2>
          <p>Merhaba ${escapeHtml(fullName)},</p>
          <p>Maliyetik hesabınızı etkinleştirmek için lütfen aşağıdaki bağlantıya tıklayın:</p>
          <p style="margin:24px 0">
            <a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">
              E-postamı Doğrula
            </a>
          </p>
          <p style="color:#64748b;font-size:13px">Bu bağlantı 24 saat geçerlidir. Bu kaydı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.</p>
        </div>
      `,
    });
  }

  /**
   * Şifre sıfırlama bağlantısı. Kullanıcı adresin sahibi olmayabilir (birisi başkasının
   * e-postasını yazmış olabilir) — bu yüzden metin, talebi yapmadıysa yok sayması
   * gerektiğini açıkça söyler ve hesabın var olup olmadığına dair bilgi vermez.
   */
  async sendPasswordResetEmail(to: string, fullName: string, resetUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Maliyetik — Şifre sıfırlama',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">
          <h2 style="color:#2563eb">Maliyetik</h2>
          <p>Merhaba ${escapeHtml(fullName)},</p>
          <p>Hesabınız için şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için:</p>
          <p style="margin:24px 0">
            <a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">
              Şifremi Sıfırla
            </a>
          </p>
          <p style="color:#64748b;font-size:13px">Bu bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir. Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.</p>
        </div>
      `,
    });
  }

  /**
   * Mali müşavirin mükellefine gönderdiği mesaj. Gönderen adı açıkça yazılır — mükellef
   * mesajın Maliyetik'ten değil müşavirinden geldiğini görsün.
   */
  async sendAccountantMessage(
    to: string, fullName: string, senderName: string, subject: string, body: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Mali müşavirinizden mesaj: ${subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">
          <h2 style="color:#2563eb">Maliyetik</h2>
          <p>Merhaba ${escapeHtml(fullName)},</p>
          <p>Mali müşaviriniz <strong>${escapeHtml(senderName)}</strong> size bir mesaj gönderdi:</p>
          <blockquote style="margin:20px 0;padding:12px 16px;background:#f1f5f9;border-left:4px solid #2563eb">
            <p style="margin:0 0 8px;font-weight:bold">${escapeHtml(subject)}</p>
            <p style="margin:0;white-space:pre-wrap">${escapeHtml(body)}</p>
          </blockquote>
          <p style="color:#64748b;font-size:13px">Bu mesaj Maliyetik panelinizde de görünür. Bu e-postaları almak istemiyorsanız Ayarlar &gt; Bildirimler bölümünden kapatabilirsiniz.</p>
        </div>
      `,
    });
  }

  /**
   * Not hatırlatması. Kullanıcı Ayarlar > Bildirimler'den kapatabilir
   * (`uiPreferences.emailReminders`), o kontrol çağıran tarafta yapılır.
   */
  async sendNoteReminder(to: string, fullName: string, note: string, remindAt: Date): Promise<void> {
    const when = formatDateTimeTr(remindAt);
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Maliyetik — Not hatırlatması',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">
          <h2 style="color:#2563eb">Maliyetik</h2>
          <p>Merhaba ${escapeHtml(fullName)},</p>
          <p>${escapeHtml(when)} için kurduğunuz hatırlatmanın vakti geldi:</p>
          <blockquote style="margin:20px 0;padding:12px 16px;background:#f1f5f9;border-left:4px solid #2563eb;white-space:pre-wrap">${escapeHtml(note)}</blockquote>
          <p style="color:#64748b;font-size:13px">Bu e-postaları almak istemiyorsanız panelde Ayarlar &gt; Bildirimler bölümünden kapatabilirsiniz.</p>
        </div>
      `,
    });
  }

  /**
   * Abonelik bitiş hatırlatması (30/7/1 gün kala).
   *
   * Bu ileti PAZARLAMA DEĞİL, hizmetin işleyişine ilişkin zorunlu bildirimdir:
   * otomatik yenileme olmadığı için haber verilmezse kullanıcı erişimini sessizce
   * kaybeder. Bu yüzden tanıtım izninden bağımsız gönderilir (bkz. Açık Rıza Metni).
   */
  async sendSubscriptionRenewalReminder(
    to: string, fullName: string, planName: string, endsAt: Date, daysLeft: number, renewUrl: string,
  ): Promise<void> {
    const when = formatDateTimeTr(endsAt);
    const kalan = daysLeft <= 1 ? 'yarın' : `${daysLeft} gün sonra`;
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Maliyetik — Aboneliğiniz ${kalan} sona eriyor`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1e293b">
          <h2 style="color:#2563eb">Maliyetik</h2>
          <p>Merhaba ${escapeHtml(fullName)},</p>
          <p><strong>${escapeHtml(planName)}</strong> aboneliğiniz ${escapeHtml(when)} tarihinde sona eriyor.</p>
          <p>Aboneliğiniz otomatik olarak yenilenmez. Kesintisiz devam etmek için dönem bitmeden yenilemeniz gerekir.</p>
          <p style="margin:24px 0">
            <a href="${escapeHtml(renewUrl)}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Aboneliği Yenile</a>
          </p>
          <p style="color:#64748b;font-size:13px">Yenilemezseniz evraklarınız silinmez; hesabınız arşiv moduna geçer, mevcut evraklarınızı görüntülemeye ve dışa aktarmaya devam edebilirsiniz.</p>
        </div>
      `,
    });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
