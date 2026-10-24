import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
@Index('idx_audit_actor', ['actorUserId', 'createdAt'])
@Index('idx_audit_entity', ['entityType', 'entityId'])
@Index('idx_audit_taxpayer', ['taxpayerId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'actor_user_id', type: 'bigint', unsigned: true, nullable: true })
  actorUserId?: string;

  @Column({ length: 80 })
  action: string;

  @Column({ name: 'entity_type', length: 50, nullable: true })
  entityType?: string;

  @Column({ name: 'entity_id', type: 'bigint', unsigned: true, nullable: true })
  entityId?: string;

  @Column({ name: 'taxpayer_id', type: 'bigint', unsigned: true, nullable: true })
  taxpayerId?: string;

  @Column({ name: 'ip_address', type: 'varbinary', length: 16, nullable: true })
  ipAddress?: Buffer;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
