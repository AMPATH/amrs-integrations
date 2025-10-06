import { DatabaseManager } from "../../config/database";
import { logger } from "../../utils/logger";

export class HieMappingService {
  private dbManager: DatabaseManager;

  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }

  async getShrPractitionerIds(
    amrsPractitionerUuids: string[]
  ): Promise<Map<string, string>> {
    if (amrsPractitionerUuids.length === 0) return new Map();

    const hieDataSource = this.dbManager.getDataSource("primary");
    const placeholders = amrsPractitionerUuids.map(() => "?").join(",");

    const query = `
    SELECT 
      pr.amrs_provider_uuid, 
      JSON_UNQUOTE(JSON_EXTRACT(pr.registry_data, '$.message.membership.id')) AS puid
    FROM practitioner_records pr
    WHERE pr.amrs_provider_uuid IN (${placeholders})
  `;

    try {
      const results = await hieDataSource.query(query, amrsPractitionerUuids);

      const practitionerMap = new Map<string, string>();
      results.forEach((row: any) => {
        practitionerMap.set(row.amrs_provider_uuid, row.puid);
      });

      return practitionerMap;
    } catch (error) {
      logger.error(
        { error, uuids: amrsPractitionerUuids },
        "Failed to batch fetch SHR Practitioner IDs"
      );
      throw error;
    }
  }

  async getShrFacilityIds(
    amrsLocationUuids: string[]
  ): Promise<Map<string, string>> {
    if (amrsLocationUuids.length === 0) return new Map();

    const hieDataSource = this.dbManager.getDataSource("hie");
    const placeholders = amrsLocationUuids.map(() => "?").join(",");

    const query = `
      SELECT fl.location_uuid, fl.facility_code as fid
      FROM facility_locations fl
      WHERE fl.location_uuid IN (${placeholders})
    `;

    try {
      const results = await hieDataSource.query(query, amrsLocationUuids);
      const facilityMap = new Map();
      results.forEach((row: any) => {
        facilityMap.set(row.location_uuid, row.fid);
      });
      return facilityMap;
    } catch (error) {
      logger.error(
        { error, uuids: amrsLocationUuids },
        "Failed to batch fetch SHR Facility IDs"
      );
      throw error;
    }
  }
}
