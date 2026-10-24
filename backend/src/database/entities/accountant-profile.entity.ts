import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('accountant_profiles')
@Index('idx_accountant_license', ['licenseNo'])
export class AccountantProfile {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true, unique: true })
  userId: string;

  @OneToOne(() => User, (u) => u.accountantProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'display_title', length: 255 })
  displayTitle: string;

  @Column({ name: 'license_no', length: 50, nullable: true })
  licenseNo?: string;

  @Column({ name: 'vkn_tckn', length: 11, nullable: true })
  vknTckn?: string;

  @Column({ name: 'office_name', length: 255, nullable: true })
  officeName?: string;

  @Column({ length: 80, nullable: true })
  city?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
