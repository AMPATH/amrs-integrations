import { ClientPaymentModeRepository } from "../../repositories/ClientPaymentModeRespository";
import {
  ClientPaymentModeDto,
  CreateClientPaymentModeDto,
} from "../../types/hie.type";
import { logger } from "../../utils/logger";

export class ClientPaymentModeService {
  private repository: ClientPaymentModeRepository;
  constructor() {
    this.repository = new ClientPaymentModeRepository();
  }
  public async findOneBy(clientPaymentModeFilter: ClientPaymentModeDto) {
    try {
      const ClientPaymentMode = await this.repository.findClientPaymentModeBy(
        clientPaymentModeFilter,
      );
      if (ClientPaymentMode) {
        return ClientPaymentMode;
      } else {
        return [];
      }
    } catch (error: any) {
      logger.error(`ClientPaymentMode fetch error: ${error.message}`);
      throw new Error(
        error.message ??
          "An error occurred while fetching ClientPaymentMode record",
      );
    }
  }
  public async create(createClientPaymentModeDto: CreateClientPaymentModeDto) {
    try {
      const resp = await this.repository.saveRecord(createClientPaymentModeDto);
      return resp;
    } catch (error: any) {
      logger.error(`ClientPaymentMode creation error: ${error.message}`);
      throw new Error(
        error.message ??
          "An error occurred while creating ClientPaymentMode record",
      );
    }
  }
}
