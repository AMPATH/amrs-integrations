import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn, 
  UpdateDateColumn, 
  Index 
} from 'typeorm';

@Entity('practitioner_records')
@Index(['identificationType', 'identificationNumber'], { unique: true })
export class PractitionerRecord {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50, name: 'identification_type' })
  identificationType!: string;

  @Column({ type: 'varchar', length: 255, name: 'identification_number' })
  identificationNumber!: string;

  @Column({ type: 'json', name: 'registry_data' })
  registryData!: any;

  @Column({ type: 'timestamp', name: 'last_synced_at' })
  lastSyncedAt!: Date;

  @Column({ type: 'timestamp', name: 'valid_until' })
  validUntil!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}