import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
@Entity({ name: 'facility_locations' })
@Index('facility_code', ['facilityCode'])
@Index('location', ['location_uuid'])
export class FacilityLocation {
  @PrimaryColumn({ name: 'location_id', type: 'int' })
  locationId!: number;

  @Column({ name: 'location_name', type: 'varchar', length: 100 })
  locationName!: string;

  @Column({
    name: 'facility_code',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  facilityCode!: string | null;

  @Column({ name: 'fr_code', type: 'varchar', length: 20, nullable: true })
  frCode!: string | null;

  @Column({ name: 'location_uuid', type: 'varchar', length: 100 })
  location_uuid!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  regulator!: string | null;

  @Column({
    name: 'facility_level',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  facilityLevel!: string | null;

  @Column({
    name: 'facility_category',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  facilityCategory!: string | null;

  @Column({
    name: 'facility_owner',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  facilityOwner!: string | null;

  @Column({
    name: 'facility_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  facilityType!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  county!: string | null;

  @Column({ name: 'sub_county', type: 'varchar', length: 100, nullable: true })
  subCounty!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ward!: string | null;

  @Column({ type: 'boolean', nullable: true })
  found!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  approved!: boolean | null;

  @Column({
    name: 'operational_status',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  operationalStatus!: string | null;

  @Column({ name: 'current_license_expiry_date', type: 'date', nullable: true })
  currentLicenseExpiryDate!: Date | null;

  @Column({
    name: 'date_created',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  dateCreated!: Date;
}
