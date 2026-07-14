import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('claim_attachment')
export class ClaimAttachment {
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
    name: 'document_type',
    nullable: true,
  })
  documentType!: string;

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
    length: 10,
    name: 'claim_attachment_action',
    nullable: false,
  })
  claimAttachmentAction!: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'attachment_id',
    nullable: true,
  })
  attachmentId!: string;

  @Column({ type: 'json', name: 'claim_attachment_response', nullable: false })
  claimAttachmentResponse!: Record<string, any>;

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
