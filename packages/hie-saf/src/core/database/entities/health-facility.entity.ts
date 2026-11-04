import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('health_facilities')
@Index(['officialName'])
export class HealthFacility {
  @PrimaryGeneratedColumn({ type: 'int', name: 'id' })
  id!: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  registrationNumber!: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  fidCode!: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  frCode!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  officialName!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  county!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  subCounty!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  town!: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  kephLevel!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  facilityType!: string;
}
