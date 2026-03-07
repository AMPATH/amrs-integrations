import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
@Entity("client_payment_modes")
@Index(["client_id", "payment_mode_uuid"], { unique: true })
export class ClientPaymentMode {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({ type: "varchar", length: 100 })
  client_id!: string;

  @Column({ type: "varchar", length: 100 })
  payment_mode_uuid!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
