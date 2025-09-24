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

  async findClosedVisitsForDate(dateString: string): Promise<Map<string, string[]>> {
    const amrsDataSource = this.dbManager.getDataSource("amrs");

    const query = `
      SELECT v.uuid as visit_uuid, p.uuid as patient_uuid, v.date_stopped
      FROM visit v
      INNER JOIN patient pat ON v.patient_id = pat.patient_id
      INNER JOIN person p ON pat.patient_id = p.person_id
      WHERE v.date_stopped IS NOT NULL
      AND DATE(v.date_stopped) = ?
      AND v.voided = 0
      ORDER BY v.date_stopped
    `;

    try {
      logger.debug({ date: dateString }, 'Executing DB query for closed visits');
      
      const result = await amrsDataSource.query(query, [dateString]);
      const visitRecords = result as VisitRecord[];
      
      logger.info({ count: visitRecords.length }, `Found ${visitRecords.length} closed visits for date ${dateString}`);

      const patientVisitMap = new Map<string, string[]>();

      for (const record of visitRecords) {
        const visitsForPatient = patientVisitMap.get(record.patient_uuid) || [];
        visitsForPatient.push(record.visit_uuid);
        patientVisitMap.set(record.patient_uuid, visitsForPatient);
      }

      return patientVisitMap;
    } catch (error: any) {
      logger.error({ error, date: dateString }, 'Failed to query database for closed visits');
      throw new Error(`Database query failed: ${error.message}`);
    }
  }
}