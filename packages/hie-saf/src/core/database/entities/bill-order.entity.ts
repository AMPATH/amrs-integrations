import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
@Entity('bill_orders')
@Index(['bill_uuid', 'order_no'], { unique: true })
export class BillOrder {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  bill_uuid!: string;

  @Column({ type: 'varchar', length: 100 })
  order_no!: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  line_item_uuid!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
