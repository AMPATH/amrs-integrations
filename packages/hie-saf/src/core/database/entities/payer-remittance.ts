import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
@Entity('payer_remittance')
export class PayerRemittance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    name: 'claim_guid',
    type: 'varchar',
    length: 100,
    unique: false,
  })
  claimGuid!: string;

  @Column({ type: 'json', name: 'payer_remmitance_response', nullable: true })
  payerRemittanceResponse!: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp', name: 'date_created' })
  dateCreated!: Date;
}
