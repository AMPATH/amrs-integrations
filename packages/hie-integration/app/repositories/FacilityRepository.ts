import { Repository } from "typeorm";
import { DatabaseManager } from "../config/database";
import { Facility } from "../models/Facility";
import { HieFacilityFilteSearchrDto } from "../types/hie.type";

export class FacilityRepository {
  private repository: Repository<Facility>;

  constructor() {
    const connection = DatabaseManager.getInstance().getDataSource("primary");
    this.repository = connection.getRepository(Facility);
  }

  async findFacilityBy(facilityFilter: HieFacilityFilteSearchrDto) {
    return this.repository.findOneBy(facilityFilter);
  }

  async saveRecord(facilityDto: Facility): Promise<Facility> {
    const existing = await this.repository.findOne({
      where: {
        facility_code: facilityDto.facility_code,
      },
    });

    let record;

    if (existing) {
      record = {
        ...existing,
        ...facilityDto,
      };
    } else {
      record = this.repository.create({
        ...facilityDto,
      });
    }

    return this.repository.save(record);
  }
}
