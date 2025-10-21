import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("facility_credentials")
export class FacilityCredentials {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 30, unique: true })
  facility_code!: string;

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
