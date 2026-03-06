import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("payments")
@Index(["payment_uuid", "reference_no"], { unique: true })
export class Payment {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({ type: "varchar", length: 100 })
  bill_uuid!: string;

  @Column({ type: "varchar", length: 100 })
  payment_uuid!: string;

  @Column({ type: "varchar", length: 100 })
  reference_no!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
