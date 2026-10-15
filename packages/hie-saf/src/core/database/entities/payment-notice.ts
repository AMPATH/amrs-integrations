import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
@Entity('payment_notice')
export class PaymentNotice {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    name: 'claim_guid',
    type: 'varchar',
    length: 100,
    unique: false,
  })
  claimGuid!: string;

  @Column({
    name: 'payment_notice_id',
    type: 'varchar',
    length: 100,
    unique: false,
  })
  paymentNoticeId!: string;

  @Column({
    name: 'provider',
    type: 'varchar',
    length: 100,
    unique: false,
  })
  provider!: string;

  @Column({
    name: 'payment_id',
    type: 'varchar',
    length: 100,
    unique: false,
  })
  paymentId!: string;

  @Column({
    name: 'payee',
    type: 'varchar',
    length: 100,
    unique: false,
  })
  payee!: string;

  @Column({
    name: 'recipient',
    type: 'varchar',
    length: 100,
    unique: false,
  })
  recipient!: string;

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  amount!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 100,
    unique: false,
  })
  status!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'date_created' })
  dateCreated!: Date;
}
