import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('claim_line')
export class ClaimLine {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'location_uuid',
    nullable: false,
  })
  @Index('location_uuid')
  locationUuid!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'consent_token',
    nullable: false,
  })
  consentToken!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'intervention_code',
    nullable: true,
    default: null,
  })
  interventionCode!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'service_name',
    nullable: true,
  })
  serviceName!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'service_identifier',
    nullable: true,
    default: null,
  })
  serviceIdentifier!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'unit_price',
    nullable: true,
    default: null,
  })
  unitPrice!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  quantity!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'scheme_code',
    nullable: true,
    default: null,
  })
  schemeCode!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'line_guid',
    nullable: true,
    default: null,
  })
  lineGuid!: string | null;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'claim_line_action',
    nullable: false,
  })
  claimLineAction!: string;

  @Column({ type: 'json', name: 'claim_line_response', nullable: false })
  claimLineResponse!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'created_by',
    nullable: true,
    default: null,
  })
  createdBy!: string | null;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  date_created!: Date;
}
