import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** (İleri) Sanal POS ile satılabilir kota paketleri */
@Entity('quota_packages')
export class QuotaPackage {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ name: 'quota_amount', type: 'bigint', unsigned: true })
  quotaAmount: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive: number;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
