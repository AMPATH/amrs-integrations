import { Repository } from "typeorm";
import { DatabaseManager } from "../config/database";
import { Facility } from "../models/Facility";
import {
  ClientPaymentModeDto,
  CreateClientPaymentModeDto,
} from "../types/hie.type";
import { ClientPaymentMode } from "../models/ClientPaymentMode";

export class ClientPaymentModeRepository {
  private repository: Repository<ClientPaymentMode>;

  constructor() {
    const connection = DatabaseManager.getInstance().getDataSource("primary");
    this.repository = connection.getRepository(ClientPaymentMode);
  }

  async findClientPaymentModeBy(clientPaymentModeFilter: ClientPaymentModeDto) {
    return this.repository.findOneBy(clientPaymentModeFilter);
  }

  async saveRecord(
    createPaymentModeDto: CreateClientPaymentModeDto,
  ): Promise<ClientPaymentMode> {
    const existing = await this.repository.findOne({
      where: {
        client_id: createPaymentModeDto.client_id,
      },
    });

    let record;

    if (existing) {
      record = {
        ...existing,
        ...createPaymentModeDto,
      };
    } else {
      record = this.repository.create({
        ...createPaymentModeDto,
      });
    }

    return this.repository.save(record);
  }
}
