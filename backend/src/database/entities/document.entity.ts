import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentSource, DocumentStatus } from '../../shared/enums';
import { TaxpayerProfile } from './taxpayer-profile.entity';
import { DocumentType } from './document-type.entity';
import { User } from './user.entity';

/**
 * Tüm evraklar (finansal + şirket). metadata JSON esnek; kanonik anahtarlar
 * (documentNo, totalAmount, taxAmount, vknTckn, counterpartyTitle, currency)
 * DB tarafında GENERATED STORED meta_* kolonlarına çıkar ve indekslenir.
 * Bu meta_* kolonları uygulama tarafından YAZILMAZ.
 */
@Entity('documents')
@Index('idx_doc_owner_type_date', ['taxpayerId', 'documentTypeId', 'documentDate', 'id'])
@Index('idx_doc_owner_created', ['taxpayerId', 'createdAt'])
@Index('idx_doc_uploader', ['uploadedByUserId'])
@Index('idx_doc_status', ['status'])
export class Document {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'char', length: 36, generated: 'uuid' })
  uuid: string;

  @Column({ name: 'taxpayer_id', type: 'bigint', unsigned: true })
  taxpayerId: string;

  @ManyToOne(() => TaxpayerProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taxpayer_id' })
  taxpayer: TaxpayerProfile;

  @Column({ name: 'document_type_id', type: 'smallint', unsigned: true })
  documentTypeId: number;

  @ManyToOne(() => DocumentType)
  @JoinColumn({ name: 'document_type_id' })
  documentType: DocumentType;

  @Column({ name: 'uploaded_by_user_id', type: 'bigint', unsigned: true })
  uploadedByUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy: User;

  /** Son değişikliği yapan kullanıcı — yüklemede yükleyenle aynı, her düzenlemede güncellenir. */
  @Column({ name: 'updated_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  updatedByUserId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedBy?: User;

  /** Evrak Kayıt (hızlı yükleme) ile eklenip henüz alanları doldurulmamışsa false. */
  @Column({ name: 'is_digitized', type: 'tinyint', width: 1, default: 1, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isDigitized: boolean;

  @Column({ name: 'digitized_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  digitizedByUserId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'digitized_by_user_id' })
  digitizedBy?: User;

  @Column({ name: 'digitized_at', type: 'datetime', nullable: true })
  digitizedAt?: Date;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'document_date', type: 'date', nullable: true })
  documentDate?: string;

  // ---- GCS depolama ----
  @Column({ name: 'storage_bucket', length: 120 })
  storageBucket: string;

  @Column({ name: 'storage_path', length: 500 })
  storagePath: string;

  @Column({ name: 'original_name', length: 255, nullable: true })
  originalName?: string;

  @Column({ name: 'mime_type', length: 120, nullable: true })
  mimeType?: string;

  @Column({ name: 'file_size', type: 'bigint', unsigned: true, nullable: true })
  fileSize?: string;

  @Column({ name: 'checksum_sha256', type: 'char', length: 64, nullable: true })
  checksumSha256?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  // ---- generated meta_* (okuma amaçlı; insert/update kapalı) ----
  @Column({ name: 'meta_amount', type: 'decimal', precision: 18, scale: 2, nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: "CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.totalAmount')) AS DECIMAL(18,2))" })
  metaAmount?: string;

  @Column({ name: 'meta_tax_id', type: 'varchar', length: 11, nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: "JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.vknTckn'))" })
  metaTaxId?: string;

  @Column({ name: 'meta_tax_amount', type: 'decimal', precision: 18, scale: 2, nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: "CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.taxAmount')) AS DECIMAL(18,2))" })
  metaTaxAmount?: string;

  @Column({ name: 'meta_direction', type: 'varchar', length: 10, nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: "JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.direction'))" })
  metaDirection?: string;

  @Column({ name: 'meta_doc_no', type: 'varchar', length: 50, nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: "JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.documentNo'))" })
  metaDocNo?: string;

  @Column({ name: 'meta_receipt_group_no', type: 'varchar', length: 50, nullable: true, insert: false, update: false, generatedType: 'STORED', asExpression: "JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.receiptGroupNo'))" })
  metaReceiptGroupNo?: string;

  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.ACTIVE })
  status: DocumentStatus;

  /**
   * Evrağın hangi yoldan girdiği. `enum` yerine varchar: yeni bir yükleme yolu
   * eklendiğinde şema değişikliği (ve kolon değiştiren bir migration) gerekmesin —
   * migration kuralı yalnızca eklemeli değişikliğe izin veriyor.
   */
  @Column({ type: 'varchar', length: 20, default: DocumentSource.UNKNOWN })
  source: DocumentSource;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
