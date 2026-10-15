import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
@Entity('payment_reconciliation')
export class PaymentReconciliation {
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
    name: 'reconciliation_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  reconciliationId!: string;

  @Column({
    name: 'identifier',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  identifier!: string;

  @Column({ name: 'issuer', type: 'varchar', length: 100, nullable: true })
  issuer!: string;

  @Column({
    name: 'disposition',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  disposition!: string;

  @Column({
    name: 'payment_identifier',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  paymentIdentifier!: string;

  @Column({
    name: 'requester',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  requester!: string;

  @Column({
    name: 'payment_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  paymentAmount!: string;

  @Column({
    name: 'payment_from',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  paymentFrom!: string;

  @Column({
    name: 'payment_to',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  paymentTo!: string;

  @Column({
    name: 'invoiced_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  invoicedAmount!: string;

  @Column({
    name: 'gross',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  gross!: string;

  @Column({
    name: 'platform_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  platformFee!: string;

  @Column({
    name: 'net',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  net!: string;

  @Column({
    name: 'approved_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  approvedAmount!: string;

  @Column({
    name: 'rejected_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  rejectedAmount!: string;

  @Column({
    name: 'discount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  discount!: string;

  @Column({
    name: 'copay',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  copay!: string;

  @Column({
    name: 'withholding_tax',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  withholdingTax!: string;

  @Column({
    name: 'uhc_contribution',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.0,
    nullable: true,
  })
  uhcContribution!: string;

  @Column({
    name: 'provider_invoice_no',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerInvoiceNo!: string;

  @CreateDateColumn({ type: 'timestamp', name: 'date_created' })
  dateCreated!: Date;
}
