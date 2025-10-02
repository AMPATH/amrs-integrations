import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Generated,
  PrimaryColumn,
} from "typeorm";
@Entity("facilities")
@Index(["facility_code", "registration_number"], { unique: true })
export class Facility {
  @PrimaryColumn({ unique: true })
  @Generated("uuid")
  uuid!: string;

  @Column({ unique: true })
  id!: string;

  @Column({ type: "varchar", length: 255 })
  facility_name!: string;

  @Column({ type: "varchar", length: 50 })
  registration_number!: string;

  @Column({ type: "varchar", length: 30 })
  facility_code!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  regulator!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  facility_level!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  facility_category!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  facility_owner!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  facility_type!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  county!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  sub_county!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  ward!: string;

  @Column({ type: "boolean", nullable: true })
  approved!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  operational_status!: string;

  @Column({ type: "date", nullable: true })
  current_license_expiry_date!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
