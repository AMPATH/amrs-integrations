import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";

export enum ProcessingStatus {
  SUCCESS = "success",
  FAILED = "failed",
}

@Entity("processed_visits")
@Index(["visitUuid"], { unique: true })
@Index(["patientUuid"])
@Index(["processedDate"])
export class ProcessedVisit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 36, name: "visit_uuid" })
  visitUuid!: string;

  @Column({ type: "varchar", length: 36, name: "patient_uuid" })
  patientUuid!: string;

  @Column({ type: "date", name: "visit_date" })
  visitDate!: string;

  @Column({
    type: "enum",
    enum: ProcessingStatus,
    default: ProcessingStatus.SUCCESS,
  })
  status!: ProcessingStatus;

  @Column({ type: "int", name: "http_status", nullable: true })
  httpStatus!: number | null;

  @Column({ type: "text", name: "error_message", nullable: true })
  errorMessage!: string | null;

  @Column({ type: "datetime", name: "processed_at" })
  processedAt!: Date;

  @Column({ type: "date", name: "processed_date" })
  processedDate!: string;
}

