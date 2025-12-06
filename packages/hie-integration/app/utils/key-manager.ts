import * as fs from "fs";
import { DatabaseManager } from "../config/database";
import { logger } from "./logger";
import { decrypt } from "./encryption.util";

const dbManager = DatabaseManager.getInstance();

export async function getPrivateKey(facilityCode: string): Promise<string> {
  const hieDataSource = dbManager.getDataSource("primary");
  const query = `
      SELECT pk
      FROM facility_credentials 
      WHERE facility_code = ? AND is_active = true
   `;

  try {
    const results = await hieDataSource.query(query, [facilityCode]);
    if (results.length === 0) {
      throw Error("Error fetching pk record");
    }
    const record = results[0];
    // buffer pk
    const pk = record.pk;
    // string pk
    const stringPk = pk.toString();
    const privateKey = decrypt(stringPk);
    return privateKey;
  } catch (error) {
    logger.error(`Error fetching credentials for ${facilityCode}:`, error);
    throw error;
  }
}
