import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Tekil satırlı sistem ayarları (id her zaman 1). Kayıt açık/kapalı, bakım modu
 * ve bakım modu IP allowlist'i burada tutulur. `SettingsService` bu satırı
 * bellekte önbelleğe alır — her request'te (bakım modu middleware'i) DB'ye
 * gitmemek için.
 */
@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({ type: 'tinyint', unsigned: true, default: 1 })
  id: number;

  @Column({
    name: 'registration_enabled',
    type: 'tinyint',
    width: 1,
    default: 1,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  registrationEnabled: boolean;

  /** Açıksa doğrulanmış mükellef kayıtları admin onayına düşer, otomatik aktifleşmez. */
  @Column({
    name: 'taxpayer_approval_required',
    type: 'tinyint',
    width: 1,
    default: 0,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  taxpayerApprovalRequired: boolean;

  /** Açıksa doğrulanmış mali müşavir kayıtları admin onayına düşer, otomatik aktifleşmez. */
  @Column({
    name: 'accountant_approval_required',
    type: 'tinyint',
    width: 1,
    default: 0,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  accountantApprovalRequired: boolean;

  @Column({
    name: 'maintenance_mode',
    type: 'tinyint',
    width: 1,
    default: 0,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  maintenanceMode: boolean;

  /** Bakım modu aktifken erişime izin verilen düz IP adresleri (CIDR yok). */
  @Column({ name: 'maintenance_allowed_ips', type: 'json' })
  maintenanceAllowedIps: string[];

  /** Kapalıysa mükellef hesapları "Evrak Dijitalleştir (AI)" ve AI ile otomatik dijitalleştirmeyi kullanamaz. */
  @Column({
    name: 'taxpayer_ai_enabled',
    type: 'tinyint',
    width: 1,
    default: 1,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  taxpayerAiEnabled: boolean;

  /** Kapalıysa mali müşavir hesapları "Evrak Dijitalleştir (AI)" ve AI ile otomatik dijitalleştirmeyi kullanamaz. */
  @Column({
    name: 'accountant_ai_enabled',
    type: 'tinyint',
    width: 1,
    default: 1,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  accountantAiEnabled: boolean;

  /** Kapalıysa mükellef hesapları mobil uygulamaya giriş yapamaz. */
  @Column({
    name: 'taxpayer_mobile_app_enabled',
    type: 'tinyint',
    width: 1,
    default: 1,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  taxpayerMobileAppEnabled: boolean;

  /** Kapalıysa mali müşavir hesapları mobil uygulamaya giriş yapamaz. */
  @Column({
    name: 'accountant_mobile_app_enabled',
    type: 'tinyint',
    width: 1,
    default: 1,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  accountantMobileAppEnabled: boolean;

  /** Kapalıysa admin hesapları mobil uygulamaya giriş yapamaz. */
  @Column({
    name: 'admin_mobile_app_enabled',
    type: 'tinyint',
    width: 1,
    default: 1,
    transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v },
  })
  adminMobileAppEnabled: boolean;

  @Column({ name: 'updated_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  updatedByUserId?: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
