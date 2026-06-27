import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'claim_visit' })
export class ClaimVisit {
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

  @Column({ type: 'varchar', length: 100, name: 'patient_id', nullable: false })
  @Index('patient_id')
  patientId!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'service_type',
    nullable: false,
  })
  serviceType!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'claim_visit_id',
    nullable: false,
  })
  claimVisitId!: string;

  @Column({ type: 'bigint', name: 'claim_visit_number', nullable: false })
  claimVisitNumber!: string;

  @Column({ type: 'datetime', name: 'visit_start', nullable: false })
  @Index('visit_start')
  visitStart!: Date;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'authorization_code',
    nullable: false,
  })
  authorizationCode!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'authorization_guid',
    nullable: false,
  })
  authorizationGuid!: string;

  @Column({ type: 'json', name: 'visit_response', nullable: false })
  visitResponse!: Record<string, any>;

  @Column({ type: 'varchar', length: 100, name: 'created_by', nullable: true })
  @Index('created_by')
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'date_created' })
  dateCreated!: Date;
}
