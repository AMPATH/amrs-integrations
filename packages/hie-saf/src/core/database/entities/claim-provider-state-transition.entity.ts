import { Column, Entity, Generated, PrimaryGeneratedColumn } from 'typeorm';

@Entity('claim_provider_state_transition')
export class ClaimProviderStateTransitionEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'uuid' })
  subject_guid!: string;

  @Column({})
  from_state!: string;

  @Column({})
  to_state!: string;

  @Column({ length: 50 })
  facility_fr_code!: string;

  @Column({ length: 100 })
  tenant_code!: string;

  @Column({})
  entity_type!: string;

  @Column({})
  timestamp!: Date;

  @Column({ length: 20 })
  consent_token!: string;

  @Column()
  @Generated('uuid')
  uuid!: string;
}
