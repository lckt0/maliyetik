import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DocumentCategory } from '../../shared/enums';

export interface MetadataFieldDef {
  key: string;
  label: string;
  type: 'string' | 'date' | 'decimal' | 'enum' | 'json';
  required: boolean;
  canonical?: boolean;
  options?: string[];
  default?: string;
}

export interface MetadataSchema {
  fields: MetadataFieldDef[];
  /** Dosya input kısıtı (HTML `accept` değeri olarak kullanılır), ör. 'image/*'. */
  fileAccept?: string;
  /** Set edilirse evrak listesinde bu kanonik alana göre aynı değere sahip kayıtlar tek satır grup olarak gösterilir. */
  groupField?: string;
  /**
   * `documents.document_date` hangi alandan doldurulacak — türde `documentDate` adında
   * bir alan YOKSA kullanılır (ör. çeklerde keşide tarihi, ekstrede dönem bitişi).
   *
   * Bu olmadan tarih o türler için hep NULL kalıyordu: tarih aralığı filtreleri o
   * evrakları sessizce dışarıda bırakıyor, tarihe göre sıralama çalışmıyordu.
   */
  dateField?: string;
}

@Entity('document_types')
@Index('idx_doctype_category', ['category', 'isActive'])
export class DocumentType {
  @PrimaryGeneratedColumn({ type: 'smallint', unsigned: true })
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'enum', enum: DocumentCategory, default: DocumentCategory.FINANCIAL })
  category: DocumentCategory;

  @Column({ name: 'metadata_schema', type: 'json', nullable: true })
  metadataSchema?: MetadataSchema;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive: number;

  /** Şirket evrakları için: true ise bu tür "Şirket Evraklarım" sayfasında zorunlu evrak kartı olarak gösterilir. */
  @Column({ name: 'is_required', type: 'tinyint', width: 1, default: 0 })
  isRequired: number;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;
}
