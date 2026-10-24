import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AuthorizationStatus } from '../../shared/enums';
import { TaxpayerProfile } from './taxpayer-profile.entity';
import { AccountantProfile } from './accountant-profile.entity';

/**
 * Mükellef → Müşavir yetkilendirme. `active_lock` generated STORED kolonu +
 * UNIQUE indeks ile bir mükellefin en fazla 1 AKTİF müşaviri olması DB
 * seviyesinde garanti edilir (bkz. 01_schema.sql).
 */
@Entity('accountant_authorizations')
@Index('idx_auth_accountant_status', ['accountantId', 'status'])
@Index('idx_auth_taxpayer_status', ['taxpayerId', 'status'])
export class AccountantAuthorization {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'taxpayer_id', type: 'bigint', unsigned: true })
  taxpayerId: string;

  @ManyToOne(() => TaxpayerProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taxpayer_id' })
  taxpayer: TaxpayerProfile;

  @Column({ name: 'accountant_id', type: 'bigint', unsigned: true })
  accountantId: string;

  @ManyToOne(() => AccountantProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountant_id' })
  accountant: AccountantProfile;

  @Column({ type: 'enum', enum: AuthorizationStatus, default: AuthorizationStatus.PENDING })
  status: AuthorizationStatus;

  @Column({ name: 'requested_by', type: 'enum', enum: ['taxpayer', 'accountant'], default: 'taxpayer' })
  requestedBy: 'taxpayer' | 'accountant';

  @Column({ length: 255, nullable: true })
  note?: string;

  @Column({ name: 'authorized_at', type: 'datetime', nullable: true })
  authorizedAt?: Date;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * status='active' iken taxpayer_id, aksi halde NULL. UNIQUE indeks NULL'ları
   * yok saydığından mükellef başına tek aktif kaydı zorlar. DB tarafında
   * GENERATED VIRTUAL — uygulama YAZMAZ (insert/update dışı).
   *
   * VIRTUAL (STORED değil): taxpayer_id aynı zamanda ON DELETE CASCADE'li FK
   * kolonu; InnoDB, STORED generated kolonun baz kolonunda cascade'e izin vermez.
   */
  @Column({
    name: 'active_lock',
    type: 'bigint',
    unsigned: true,
    nullable: true,
    insert: false,
    update: false,
    generatedType: 'VIRTUAL',
    asExpression: "CASE WHEN status = 'active' THEN taxpayer_id ELSE NULL END",
  })
  activeLock?: string;
}
