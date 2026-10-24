import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { AccountantProfile } from './accountant-profile.entity';

@Entity('taxpayer_profiles')
@Index('idx_taxpayer_accountant', ['currentAccountantId'])
export class TaxpayerProfile {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, unique: true })
  userId: string;

  @OneToOne(() => User, (u) => u.taxpayerProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'company_title', length: 255 })
  companyTitle: string;

  @Column({ name: 'tax_office', length: 120, nullable: true })
  taxOffice?: string;

  @Column({ name: 'vkn_tckn', length: 11, unique: true })
  vknTckn: string;

  @Column({ length: 500, nullable: true })
  address?: string;

  /** Denormalize "mevcut aktif müşavir" pointer'ı — kaynak: accountant_authorizations */
  @Column({ name: 'current_accountant_id', type: 'bigint', unsigned: true, nullable: true })
  currentAccountantId?: string;

  @ManyToOne(() => AccountantProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'current_accountant_id' })
  currentAccountant?: AccountantProfile;

  @Column({ name: 'quota_limit', type: 'bigint', unsigned: true, default: 0 })
  quotaLimit: string;

  /**
   * Tavanın mükellefin KENDİ planından gelen payı. Aynı planın yenilenmesi bu payı
   * değiştirmediği için kota birikmez (bkz. migration AnnualPlansAndFixedQuota).
   */
  @Column({ name: 'quota_from_plan', type: 'bigint', unsigned: true, default: 0 })
  quotaFromPlan: string;

  /**
   * Tavanın KALICI olarak satın alınmış payı (ek kota paketleri). Önceden
   * `quota_limit - quota_from_plan` ile türetiliyordu; tavan kırpıldığında bu türetme
   * bozuluyor ve kırpılan fark kalıcı "satın alınmış" hak sayılıyordu. Artık açıkça
   * tutulur (bkz. migration AccountantSeatsAndArchive).
   */
  @Column({ name: 'quota_purchased', type: 'bigint', unsigned: true, default: 0 })
  quotaPurchased: string;

  /**
   * Tavanın mükellefin MÜŞAVİRİNİN koltuğundan gelen payı. Kendi planıyla toplanmaz,
   * aralarında MAX alınır: bir mükellef için tek ödeme yapılır, çifte hak doğmaz.
   * Yetki kalkınca 0'a çekilir — evrak silinmez, mükellef arşiv moduna düşer.
   */
  @Column({ name: 'quota_from_accountant', type: 'bigint', unsigned: true, default: 0 })
  quotaFromAccountant: string;

  @Column({ name: 'quota_used', type: 'bigint', unsigned: true, default: 0 })
  quotaUsed: string;

  /** true ise mevcut mali müşavir kota bakiyesi/geçmişini görebilir (Hesap sayfasından kapatılabilir). */
  @Column({ name: 'accountant_can_view_quota', type: 'tinyint', width: 1, default: 1, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  accountantCanViewQuota: boolean;

  /** true ise mevcut mali müşavir AI kredi bakiyesi/geçmişini görebilir (Hesap sayfasından kapatılabilir). */
  @Column({ name: 'accountant_can_view_ai_credits', type: 'tinyint', width: 1, default: 1, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  accountantCanViewAiCredits: boolean;

  /**
   * Dışa Aktar → Z-Raporu/Luca Excel için hesap kodları — bkz. lucaExport.ts. Tümü opsiyonel.
   * KDV oranına göre ayrı hesap kodları tutulur (satış/KDV hesapları mükellefin planında
   * genelde orana göre de ayrışabildiğinden) — %0'da "hesaplanan KDV" olmaz, yalnızca satış
   * toplamı vardır.
   */
  @Column({ name: 'luca_kasa_hesap_kodu', length: 20, nullable: true })
  lucaKasaHesapKodu?: string;

  @Column({ name: 'luca_kredi_karti_hesap_kodu', length: 20, nullable: true })
  lucaKrediKartiHesapKodu?: string;

  @Column({ name: 'luca_yemek_karti_hesap_kodu', length: 20, nullable: true })
  lucaYemekKartiHesapKodu?: string;

  @Column({ name: 'luca_kdv0_toplam_hesap_kodu', length: 20, nullable: true })
  lucaKdv0ToplamHesapKodu?: string;

  @Column({ name: 'luca_kdv10_toplam_hesap_kodu', length: 20, nullable: true })
  lucaKdv10ToplamHesapKodu?: string;

  @Column({ name: 'luca_kdv10_hesaplanan_hesap_kodu', length: 20, nullable: true })
  lucaKdv10HesaplananHesapKodu?: string;

  @Column({ name: 'luca_kdv20_toplam_hesap_kodu', length: 20, nullable: true })
  lucaKdv20ToplamHesapKodu?: string;

  @Column({ name: 'luca_kdv20_hesaplanan_hesap_kodu', length: 20, nullable: true })
  lucaKdv20HesaplananHesapKodu?: string;

  @Column({ name: 'luca_belge_turu', length: 20, nullable: true })
  lucaBelgeTuru?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
