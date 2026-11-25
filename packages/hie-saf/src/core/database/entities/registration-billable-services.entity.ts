import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'registration_billable_services' })
export class RegistrationBillableService {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({
    name: 'billable_service_name',
    type: 'varchar',
    length: 45,
    nullable: false,
  })
  billableServiceName!: string;

  @Column({
    name: 'billable_service_uuid',
    type: 'varchar',
    length: 45,
    nullable: false,
  })
  billableServiceUuid!: string;

  @Column({
    name: 'location_uuid',
    type: 'varchar',
    length: 45,
    nullable: false,
  })
  locationUuid!: string;
}
