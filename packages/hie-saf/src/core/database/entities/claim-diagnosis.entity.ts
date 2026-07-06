import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'claim_diagnosis' })
export class ClaimDiagnosis {
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
    length: 255,
    name: 'intervention_code',
    nullable: false,
  })
  interventionCode!: string;

  @Column({ type: 'varchar', length: 100, name: 'icd_code', nullable: false })
  icdCode!: string;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'diagnosis_action',
    nullable: false,
  })
  diagnosisAction!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'practitioner_identification_number',
    nullable: true,
  })
  practitionerIdentificationNumber!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'practitioner_identification_type',
    nullable: true,
  })
  practitionerIdentificationType!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'practitioner_regulation_body',
    nullable: true,
  })
  practitionerRegulationBody!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'consent_token',
    nullable: false,
  })
  @Index('consent_token')
  consentToken!: string;

  @Column({ type: 'json', name: 'diagnosis_response', nullable: false })
  diagnosisResponse!: Record<string, any>;

  @Column({ type: 'varchar', length: 100, name: 'created_by', nullable: true })
  @Index('created_by')
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'date_created' })
  @Index('date_created')
  dateCreated!: Date;
}
