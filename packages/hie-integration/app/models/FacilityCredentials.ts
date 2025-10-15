import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  Index,
} from "typeorm";

@Entity("facility_credentials")
@Index(["location_uuid"], { unique: true })
export class FacilityCredentials {
  @PrimaryColumn({ type: "varchar", length: 36 })
  location_uuid!: string;

  @Column({ type: "varchar", length: 255 })
  facility_name!: string;

  @Column({ type: "varchar", length: 255 })
  consumer_key!: string;

  @Column({ type: "varchar", length: 255 })
  username!: string;

  @Column({ type: "varchar", length: 255 })
  password!: string;

  @Column({ type: "boolean", default: true })
  is_active!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}