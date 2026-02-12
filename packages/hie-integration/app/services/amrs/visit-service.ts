import { DatabaseManager } from "../../config/database";
import { logger } from "../../utils/logger";

export interface VisitRecord {
  visit_uuid: string;
  patient_uuid: string;
  date_stopped: Date;
}

export class VisitService {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  /**
   * Find closed visits for a specific date (uses full day range)
   * @param dateString Date in 'YYYY-MM-DD' format
   */
  async findClosedVisitsForDate(dateString: string): Promise<Map<string, string[]>> {
    // Convert date string to start/end timestamps for the full day
    const startTimestamp = `${dateString} 00:00:00`;
    const endTimestamp = `${dateString} 23:59:59`;
    
    return this.findClosedVisitsInRange(startTimestamp, endTimestamp);
  }

  /**
   * Find closed visits within a timestamp range
   * @param startTimestamp Start timestamp (e.g., '2024-01-15 08:00:00' or '2024-01-15')
   * @param endTimestamp End timestamp (e.g., '2024-01-15 17:00:00' or '2024-01-15')
   */
  async findClosedVisitsInRange(
    startTimestamp: string,
    endTimestamp: string
  ): Promise<Map<string, string[]>> {
    const amrsDataSource = this.dbManager.getDataSource("amrs");

    // Use range query for index usage on date_started
    const query = `
      SELECT v.uuid as visit_uuid, p.uuid as patient_uuid
      FROM visit v
      INNER JOIN patient pat ON v.patient_id = pat.patient_id
      INNER JOIN person p ON pat.patient_id = p.person_id
      WHERE v.date_stopped IS NOT NULL
      AND v.date_started >= ?
      AND v.date_started <= ?
      AND v.voided = 0 and p.uuid = "92726750-5329-415a-9f23-4ce40908b66b"
    `;

    try {
      logger.debug(
        { startTimestamp, endTimestamp },
        'Executing DB query for closed visits in range'
      );
      
      const result = await amrsDataSource.query(query, [startTimestamp, endTimestamp]);
      const visitRecords = result as VisitRecord[];
      
      logger.info(
        { count: visitRecords.length, startTimestamp, endTimestamp },
        `Found ${visitRecords.length} closed visits in range`
      );

      const patientVisitMap = new Map<string, string[]>();

      for (const record of visitRecords) {
        const existing = patientVisitMap.get(record.patient_uuid);
        if (existing) {
          existing.push(record.visit_uuid);
        } else {
          patientVisitMap.set(record.patient_uuid, [record.visit_uuid]);
        }
      }

      return patientVisitMap;
    } catch (error: any) {
      logger.error(
        { error, startTimestamp, endTimestamp },
        'Failed to query database for closed visits'
      );
      throw new Error(`Database query failed: ${error.message}`);
    }
  }
}