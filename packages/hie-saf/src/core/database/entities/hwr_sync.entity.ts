import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
@Entity('hwr_sync')
@Index(['provider_uuid', 'national_id'], { unique: true })
export class HwrSync {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  provider_uuid!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  national_id!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location_uuid!: string;

  @CreateDateColumn({ name: 'created_at' })
  createed_at!: Date;
}
