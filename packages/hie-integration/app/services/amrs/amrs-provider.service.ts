import { DatabaseManager } from '../../config/database';
import { logger } from '../../utils/logger';

export interface AmrsProvider {
  location_id: number;
  name: string;
  provider_id: number;
  names: string;
  national_id: string;
}

export class AmrsProviderService {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  async getActiveProviders(locationUuid: string): Promise<AmrsProvider[]> {
    const amrsDataSource = this.dbManager.getDataSource('amrs');
    
    const query = `
      SELECT 
        e.location_id,
        l.name,
        ep.provider_id,
        CONCAT(pn.given_name, "  ", pn.middle_name, " ",  pn.family_name) AS names,
        pa.value_reference AS national_id
      FROM amrs.encounter e 
      INNER JOIN amrs.location l ON e.location_id = l.location_id
      INNER JOIN amrs.encounter_provider ep ON e.encounter_id = ep.encounter_id
      INNER JOIN amrs.provider pr ON ep.provider_id = pr.provider_id
      INNER JOIN amrs.person_name pn ON pn.person_id = pr.person_id 
      INNER JOIN amrs.provider_attribute pa ON (
        pa.provider_id = pr.provider_id AND pa.attribute_type_id = 5
      )
      WHERE 
        e.encounter_datetime BETWEEN DATE_SUB(NOW(), INTERVAL 12 MONTH) AND NOW()
        AND l.uuid = ?
        AND pr.retired = 0
        AND (e.voided IS NULL OR e.voided = 0)
      GROUP BY pr.provider_id;
    `;

    try {
      const result = await amrsDataSource.query(query, [locationUuid]);
      return result;
    } catch (error: any) {
      logger.error(`AMRS provider query failed: ${error.message}`);
      throw new Error('Failed to fetch provider data from AMRS database');
    }
  }
}