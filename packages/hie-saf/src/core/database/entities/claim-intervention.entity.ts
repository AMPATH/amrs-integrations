import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'claim_interventions' })
export class ClaimIntervention {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'location_uuid',
    nullable: false,
  })
  @Index('location_uuid')
  locationUuid!: string;

  @Column({
    type: 'varchar',
    length: 10,
    name: 'intervention_action',
    nullable: false,
  })
  interventionAction!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'consent_token',
    nullable: false,
  })
  @Index('consent_token')
  consentToken!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'intervention_code',
    nullable: true,
  })
  interventionCode!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'existing_intervention_code',
    nullable: true,
  })
  existingInterventionCode!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'new_intervention_code',
    nullable: true,
  })
  newInterventionCode!: string | null;

  @Column({ type: 'boolean', name: 'retain_bill_items', nullable: true })
  retainBillItems!: boolean | null;

  @Column({ type: 'varchar', length: 100, name: 'bill_from', nullable: true })
  billFrom!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'bill_to', nullable: true })
  billTo!: string | null;

  @Column({ type: 'json', name: 'intervention_response', nullable: false })
  interventionResponse!: Record<string, any>;

  @Column({ type: 'varchar', length: 100, name: 'created_by', nullable: true })
  @Index('created_by')
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'date_created' })
  @Index('date_created')
  dateCreated!: Date;
}
