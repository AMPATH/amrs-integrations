import { Column, Entity, Generated, PrimaryGeneratedColumn } from 'typeorm';

@Entity('claim_payer_state_transition')
export class ClaimPayerStateTransitionEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'uuid' })
  subject_guid!: string;

  @Column({ length: 50 })
  provider_claim_no!: string;

  @Column({})
  from_state!: string;

  @Column({})
  to_state!: string;

  @Column({ length: 50 })
  facility_fr_code!: string;

  @Column({})
  entity_type!: string;

  @Column({})
  timestamp!: Date;

  @Column({ length: 20 })
  consent_token!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  notes!: string;

  @Column()
  @Generated('uuid')
  uuid!: string;
}
