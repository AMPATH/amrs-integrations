import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
@Entity('bill_orders')
@Index(['bill_uuid', 'order_no', 'line_item_uuid'], { unique: true })
export class BillOrder {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  bill_uuid!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  order_no!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  line_item_uuid!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  intervention_code!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  consent_token!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  service_type!: string;

  @Column({ type: 'boolean', default: false, nullable: true })
  requires_preauth!: boolean;

  @Column({ type: 'boolean', default: false, nullable: true })
  normal_preauth!: boolean;

  @Column({ type: 'boolean', default: false, nullable: true })
  elective_preauth!: boolean;

  @Column({ type: 'boolean', default: false, nullable: true })
  preauth_approved!: boolean;

  @Column({ type: 'text', default: false, nullable: true })
  required_documents!: string;

  @Column({ type: 'text', default: false, nullable: true })
  applicable_document_types!: string;

  @Column({ type: 'text', default: false, nullable: true })
  required_preauth_document_types!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
