import { Repository, In } from "typeorm";
import { ProcessedVisit, ProcessingStatus } from "../models/ProcessedVisit";
import { DatabaseManager } from "../config/database";
import { logger } from "../utils/logger";

export class ProcessedVisitRepository {
  private repository: Repository<ProcessedVisit>;

  constructor() {
    const connection = DatabaseManager.getInstance().getDataSource("primary");
    this.repository = connection.getRepository(ProcessedVisit);
  }

  /**
   * Find all successfully processed visit UUIDs from a given list
   * Failed visits are not included, allowing them to be retried automatically
   */
  async findProcessedVisitUuids(visitUuids: string[]): Promise<Set<string>> {
    if (visitUuids.length === 0) {
      return new Set();
    }

    const processed = await this.repository.find({
      where: {
        visitUuid: In(visitUuids),
        status: ProcessingStatus.SUCCESS,
      },
      select: ["visitUuid"],
    });

    return new Set(processed.map((p) => p.visitUuid));
  }

  /**
   * Mark a visit as successfully processed
   * @param batchTimestamp The start timestamp of the batch being processed (e.g., '2024-01-15 00:00:00')
   */
  async markVisitProcessed(
    visitUuid: string,
    patientUuid: string,
    visitDate: string,
    httpStatus: number,
    batchTimestamp: string
  ): Promise<ProcessedVisit> {
    const processedAt = new Date(batchTimestamp);
    const processedDate = batchTimestamp.split(" ")[0];

    // Check if record already exists
    const existing = await this.repository.findOne({
      where: { visitUuid },
    });

    if (existing) {
      // Update existing record
      existing.patientUuid = patientUuid;
      existing.visitDate = visitDate;
      existing.status = ProcessingStatus.SUCCESS;
      existing.httpStatus = httpStatus;
      existing.processedAt = processedAt;
      existing.processedDate = processedDate;
      existing.errorMessage = null; // Clear any previous error
      return this.repository.save(existing);
    }

    // Create new record
    const record = this.repository.create({
      visitUuid,
      patientUuid,
      visitDate,
      status: ProcessingStatus.SUCCESS,
      httpStatus,
      processedAt,
      processedDate,
    });

    return this.repository.save(record);
  }

  /**
   * Mark a visit as failed processing
   * @param batchTimestamp The start timestamp of the batch being processed
   */
  async markVisitFailed(
    visitUuid: string,
    patientUuid: string,
    visitDate: string,
    errorMessage: string,
    batchTimestamp: string,
    httpStatus?: number
  ): Promise<ProcessedVisit> {
    const processedAt = new Date(batchTimestamp);
    const processedDate = batchTimestamp.split(" ")[0];

    // Check if record already exists
    const existing = await this.repository.findOne({
      where: { visitUuid },
    });

    if (existing) {
      // Update existing record
      existing.patientUuid = patientUuid;
      existing.visitDate = visitDate;
      existing.status = ProcessingStatus.FAILED;
      existing.httpStatus = httpStatus ?? null;
      existing.errorMessage = errorMessage;
      existing.processedAt = processedAt;
      existing.processedDate = processedDate;
      return this.repository.save(existing);
    }

    // Create new record
    const record = this.repository.create({
      visitUuid,
      patientUuid,
      visitDate,
      status: ProcessingStatus.FAILED,
      httpStatus: httpStatus ?? null,
      errorMessage,
      processedAt,
      processedDate,
    });

    return this.repository.save(record);
  }

  /**
   * Get failed visits for a specific date for retry
   */
  async getFailedVisitsForDate(visitDate: string): Promise<ProcessedVisit[]> {
    return this.repository.find({
      where: {
        visitDate,
        status: ProcessingStatus.FAILED,
      },
    });
  }

  /**
   * Delete failed record to allow reprocessing
   */
  async clearFailedVisit(visitUuid: string): Promise<void> {
    await this.repository.delete({
      visitUuid,
      status: ProcessingStatus.FAILED,
    });
  }

  /**
   * Get processing stats for a date range
   */
  async getProcessingStats(
    startDate: string,
    endDate: string
  ): Promise<{ successCount: number; failedCount: number }> {
    const [successCount, failedCount] = await Promise.all([
      this.repository.count({
        where: {
          processedDate: startDate,
          status: ProcessingStatus.SUCCESS,
        },
      }),
      this.repository.count({
        where: {
          processedDate: startDate,
          status: ProcessingStatus.FAILED,
        },
      }),
    ]);

    return { successCount, failedCount };
  }
}

