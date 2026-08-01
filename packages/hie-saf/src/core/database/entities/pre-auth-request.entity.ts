import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('pre_auth_requests', { schema: 'hie' })
@Index('idx_consent_token', ['consentToken'])
@Index('idx_location_uuid', ['locationUuid'])
@Index('idx_intervention_code', ['interventionCode'])
@Index('idx_sub_benefit_code', ['subBenefitCode'])
export class PreAuthRequest {
  @PrimaryGeneratedColumn({ name: 'id', type: 'int' })
  id!: number;

  @Column({
    name: 'patient_uuid',
    type: 'varchar',
    length: 200,
    nullable: false,
  })
  patientUuid!: string;

  @Column({
    name: 'sub_benefit_code',
    type: 'varchar',
    length: 200,
    nullable: false,
  })
  subBenefitCode!: string;

  @Column({ name: 'order_no', type: 'varchar', length: 200, nullable: false })
  orderNo!: string;

  @Column({
    name: 'intervention_code',
    type: 'varchar',
    length: 200,
    nullable: false,
  })
  interventionCode!: string;

  @Column({
    name: 'consent_token',
    type: 'varchar',
    length: 200,
    nullable: false,
  })
  consentToken!: string;

  @Column({
    name: 'service_type',
    type: 'varchar',
    length: 200,
    nullable: false,
  })
  serviceType!: string;

  @Column({
    name: 'location_uuid',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  locationUuid!: string;

  @Column({ name: 'requires_preauth', type: 'boolean', nullable: true })
  requiresPreauth!: boolean;

  @Column({ name: 'normal_preauth', type: 'boolean', nullable: true })
  normalPreauth!: boolean;

  @Column({ name: 'elective_preauth', type: 'boolean', nullable: true })
  electivePreauth!: boolean;

  @Column({
    name: 'applicable_document_types',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  applicableDocumentTypes!: string;

  @Column({
    name: 'required_preauth_document_types',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  requiredPreauthDocumentTypes!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, nullable: true })
  status!: string;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy!: string;

  @CreateDateColumn({
    name: 'date_created',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  dateCreated!: Date;

  @Column({ name: 'voided', type: 'boolean', nullable: true })
  voided!: boolean;

  @Column({ name: 'voided_by', type: 'varchar', length: 100, nullable: true })
  voidedBy!: string;

  @UpdateDateColumn({
    name: 'date_updated',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  dateUpdated!: Date;

  @Column({ name: 'updated_by', type: 'varchar', length: 100, nullable: true })
  updatedBy!: string;

  @Column({
    name: 'date_voided',
    type: 'timestamp',
    nullable: true,
  })
  dateVoided!: Date;
}
