import { HieHttpClient } from "../../utils/http-client";
import config from "../../config/env";
import { logger } from "../../utils/logger";
import {
  FacilityFilterDto,
  FacilityFilterType,
  FacilitySearchResponse,
  HieFacilityFilteSearchrDto,
} from "../../types/hie.type";
import { FacilityRepository } from "../../repositories/FacilityRepository";
import { Facility } from "../../models/Facility";
import moment from "moment";

export class FacilityRegistryService {
  private httpClient: HieHttpClient;
  private repository: FacilityRepository;

  constructor(facilityUuid: string) {
    this.httpClient = new HieHttpClient(config.HIE.BASE_URL, facilityUuid);
    this.repository = new FacilityRepository();
  }

  async searchFacilityByCode(
    facilitySearchFilterDto: FacilityFilterDto
  ): Promise<FacilitySearchResponse> {
    // find if facility is in records
    const queryFilter = this.generateFacilityFindByFilter(
      facilitySearchFilterDto
    );
    const facility = await this.repository.findFacilityBy(queryFilter);
    if (facility) {
      const daysSinceLastUpdate = moment().diff(
        moment(facility.updatedAt),
        "days"
      );
      if (daysSinceLastUpdate < 7) {
        return {
          message: facility as any,
        };
      } else {
        return this.fetchAndSaveRecordFromHie(facilitySearchFilterDto);
      }
    } else {
      return this.fetchAndSaveRecordFromHie(facilitySearchFilterDto);
    }
  }
  async fetchAndSaveRecordFromHie(facilitySearchFilterDto: FacilityFilterDto) {
    const resp = await this.getFacilityFromFacilityRegistry(
      facilitySearchFilterDto
    );
    // save the record in the database
    const { message } = resp;
    await this.repository.saveRecord((message as unknown) as Facility);
    return resp;
  }
  async getFacilityFromFacilityRegistry(
    facilitySearchFilterDto: FacilityFilterDto
  ) {
    try {
      const filter = this.generateFacilityFilterSearchFilter(
        facilitySearchFilterDto
      );
      const response = await this.httpClient.get<FacilitySearchResponse>(
        config.HIE.FACILITY_SEARCH_URL,
        filter
      );

      if (response.data.message.found === 0) {
        throw new Error(
          `Facility not found for ${facilitySearchFilterDto.filterType}: ${facilitySearchFilterDto.filterValue}`
        );
      }
      return response.data;
    } catch (error: any) {
      logger.error(`HIE Facility Registry request failed: ${error.message}`);
      throw new Error(
        `Failed to fetch facility from HIE: ${
          error.response?.data?.error_msg || error.message
        }`
      );
    }
  }
  generateFacilityFilterSearchFilter(
    facilitySearchFilterDto: FacilityFilterDto
  ): HieFacilityFilteSearchrDto {
    const filter: HieFacilityFilteSearchrDto = {};
    if (
      facilitySearchFilterDto.filterType === FacilityFilterType.facilityCode
    ) {
      filter["facility_code"] = facilitySearchFilterDto.filterValue;
    }
    if (
      facilitySearchFilterDto.filterType ===
      FacilityFilterType.registrationNumber
    ) {
      filter["registration_number"] = facilitySearchFilterDto.filterValue;
    }
    return filter;
  }
  generateFacilityFindByFilter(
    facilityFilterDto: FacilityFilterDto
  ): HieFacilityFilteSearchrDto {
    const filter: HieFacilityFilteSearchrDto = {};
    if (facilityFilterDto.filterType === FacilityFilterType.facilityCode) {
      filter["facility_code"] = facilityFilterDto.filterValue;
    }
    if (
      facilityFilterDto.filterType === FacilityFilterType.registrationNumber
    ) {
      filter["registration_number"] = facilityFilterDto.filterValue;
    }
    return filter;
  }
}
