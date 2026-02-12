import { DatabaseManager } from "../../config/database";
import { decrypt, encrypt } from "../../utils/encryption.util";
import { logger } from "../../utils/logger";
import { PKEncryption } from "../../utils/pk-encryption";

export interface FacilityCredentials {
  location_uuid: string;
  facility_name: string;
  consumer_key: string;
  username: string;
  password: string;
  is_active: boolean;
}

export interface FacilityCredentialsData {
  facility_code: string;
  consumer_key: string;
  username: string;
  password: string;
  agent: string;
  is_active?: boolean;
}

export interface FacilityCredentialsRecord extends FacilityCredentialsData {
  createdAt: Date;
  updatedAt: Date;
}

export interface EncounterContext {
  encounterUuid: string;
  visitUuid: string;
  locationUuid: string;
}

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

    const hieDataSource = this.dbManager.getDataSource("primary");
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

  async saveCredentials(
    credentials: FacilityCredentialsData
  ): Promise<FacilityCredentialsRecord | null> {
    const hieDataSource = this.dbManager.getDataSource("primary");
    const pKEncryption = new PKEncryption();
    const isDuplicate = await this.checkForDuplicateLocation(
      credentials.facility_code
    );
    if (isDuplicate) {
      throw new Error(
        `Credentials for location ${credentials.facility_code} already exist.`
      );
    }

    // Encrypt password before saving
    const encryptedPassword = encrypt(credentials.password);
    const encryptedPk = pKEncryption.encryptText() ?? null;

    const query = `
      INSERT INTO facility_credentials 
        (facility_code, consumer_key, username, password, is_active, pk, agent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        facility_code = VALUES(facility_code),
        consumer_key = VALUES(consumer_key),
        username = VALUES(username),
        password = VALUES(password),
        is_active = VALUES(is_active),
        pk=VALUES(pk),
        agent=VALUES(agent),
        updated_at = NOW()
    `;

    try {
      await hieDataSource.query(query, [
        credentials.facility_code,
        credentials.consumer_key,
        credentials.username,
        encryptedPassword,
        credentials.is_active ?? true,
        encryptedPk,
        credentials.agent,
      ]);

      return this.getFacilityCredentials(
        credentials.facility_code
      ) as Promise<FacilityCredentialsRecord | null>;
    } catch (error: any) {
      logger.error("Failed to save facility credentials:", error);
      throw new Error(`Failed to save facility credentials ${error.message}`);
    }
  }

  async getFacilityCredentials(
    facilityCode: string
  ): Promise<FacilityCredentials | null> {
    const hieDataSource = this.dbManager.getDataSource("primary");
    const query = `
      SELECT facility_code, consumer_key, username, password, is_active
      FROM facility_credentials 
      WHERE facility_code = ? AND is_active = true
    `;

    try {
      const results = await hieDataSource.query(query, [facilityCode]);
      if (results.length === 0) {
        return null;
      }

      const record = results[0];
      // Decrypt password when retrieving
      record.password = decrypt(record.password);
      return record;
    } catch (error) {
      logger.error(`Error fetching credentials for ${facilityCode}:`, error);
      throw error;
    }
  }

  async getAllActiveFacilities(): Promise<FacilityCredentials[]> {
    const hieDataSource = this.dbManager.getDataSource("primary");
    const query = `
      SELECT facility_code, consumer_key, username, is_active, password
      FROM facility_credentials 
      WHERE is_active = true
      ORDER BY facility_name
    `;

    try {
      const results = await hieDataSource.query(query);
      return results.map((record: any) => ({
        ...record,
        password: decrypt(record.password),
      }));
    } catch (error) {
      logger.error("Error fetching all active facilities:", error);
      throw error;
    }
  }

  async updateCredentialsStatus(
    locationUuid: string,
    isActive: boolean
  ): Promise<boolean> {
    const hieDataSource = this.dbManager.getDataSource("primary");
    const query = `
      UPDATE facility_credentials 
      SET is_active = ?, updated_at = NOW()
      WHERE location_uuid = ?
    `;

    try {
      const result = await hieDataSource.query(query, [isActive, locationUuid]);
      return result.affectedRows > 0;
    } catch (error) {
      logger.error("Failed to update credentials status:", error);
      throw new Error("Failed to update credentials status");
    }
  }

  private async checkForDuplicateLocation(
    facilityCode: string
  ): Promise<boolean> {
    const hieDataSource = this.dbManager.getDataSource("primary");
    const query = `SELECT facility_code FROM facility_credentials WHERE facility_code = ?`;
    const results = await hieDataSource.query(query, [facilityCode]);
    return results.length > 0;
  }
  public async getFacilityCodeUsingLocationUuid(locationUuid: string) {
    if (!locationUuid) {
      return null;
    }
    const facilityMap = await this.getShrFacilityIds([locationUuid]);
    if (facilityMap.has(locationUuid)) {
      return facilityMap.get(locationUuid);
    } else {
      return null;
    }
  }
  public async getAgentUsingLocationUuid(
    locationUuid: string
  ): Promise<string> {
    const hieDataSource = this.dbManager.getDataSource("primary");
    const query = `SELECT fc.agent 
    FROM 
    hie.facility_credentials fc
        JOIN
    facility_locations fl ON (fc.facility_code = fl.facility_code)
    WHERE
    fl.location_uuid = ?;
    `;

    try {
      const results = await hieDataSource.query(query, [locationUuid]);
      if (results.length === 0) {
        throw new Error(`Agent for the facility ${locationUuid} not found`);
      } else {
        return results[0].agent ?? "";
      }
    } catch (error) {
      logger.error("Error fetching all active facilities:", error);
      throw error;
    }
  }

  public async getShrPatientId(amrsPatientUuid: string): Promise<string> {
    const amrsDataSource = this.dbManager.getDataSource("amrs");
    console.log("amrsPatientUuid", amrsPatientUuid);
    const query = `
      SELECT pi.identifier
      FROM patient_identifier pi
      JOIN patient_identifier_type pit ON pi.identifier_type = pit.patient_identifier_type_id
      JOIN person p ON pi.patient_id = p.person_id
      WHERE p.uuid = ? AND pit.patient_identifier_type_id = 55 AND pi.voided = 0
    `;

    try {
      const result = await amrsDataSource.query(query, [amrsPatientUuid]);

      if (result && result.length > 0) {
        return result[0].identifier;
      }

      throw new Error(
        `Patient ${amrsPatientUuid} does not have a Client Registry Number. Aborting bundle generation.`
      );
    } catch (error: any) {
      logger.error(
        { error, patientUuid: amrsPatientUuid },
        "Failed to fetch Patient CR"
      );
      throw error;
    }
  }

  public async getEncounterContext(encounterUuid: string): Promise<EncounterContext | null> {
    const amrsDataSource = this.dbManager.getDataSource("amrs");
    const query = `
      SELECT 
        e.uuid as encounter_uuid,
        v.uuid as visit_uuid,
        l.uuid as location_uuid
      FROM encounter e
      JOIN visit v ON e.visit_id = v.visit_id
      JOIN location l ON v.location_id = l.location_id
      WHERE e.uuid = ?
    `;

    try {
      const result = await amrsDataSource.query(query, [encounterUuid]);

      if (result && result.length > 0) {
        return {
          encounterUuid: result[0].encounter_uuid,
          visitUuid: result[0].visit_uuid,
          locationUuid: result[0].location_uuid
        };
      }
      return null;
    } catch (error) {
      logger.error(
        { error, encounterUuid },
        "Failed to fetch encounter context"
      );
      throw error;
    }
  }
}
