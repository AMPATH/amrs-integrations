import { Repository } from "typeorm";
import { PractitionerRecord } from "../models/PractitionerRecord";
import { DatabaseManager } from "../config/database";
import { Identifier } from "../types/hie.type";

export class PractitionerRepository {
  private repository: Repository<PractitionerRecord>;

  constructor() {
    const connection = DatabaseManager.getInstance().getDataSource();
    this.repository = connection.getRepository(PractitionerRecord);
  }

  async findByIdentifier(
    identifier: Identifier
  ): Promise<PractitionerRecord | null> {
    return this.repository.findOne({
      where: {
        identificationType: identifier.type,
        identificationNumber: identifier.value,
      },
    });
  }

  async saveRecord(
    identifier: Identifier,
    registryData: any,
    validityDays: number = 7
  ): Promise<PractitionerRecord> {
    const lastSyncedAt = new Date();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validityDays);

    const existing = await this.repository.findOne({
      where: {
        identificationType: identifier.type,
        identificationNumber: identifier.value,
      },
    });

    if (existing) {
      existing.registryData = registryData;
      existing.lastSyncedAt = lastSyncedAt;
      existing.validUntil = validUntil;
      return this.repository.save(existing);
    }

    const record = this.repository.create({
      identificationType: identifier.type,
      identificationNumber: identifier.value,
      registryData,
      lastSyncedAt,
      validUntil,
    });

    return this.repository.save(record);
  }
}
