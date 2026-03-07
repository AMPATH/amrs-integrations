import { Repository } from "typeorm";
import { DatabaseManager } from "../config/database";
import { BillOrder } from "../models/BillOrder";
import {
  CreateBillOrderDto,
  BillOrderFilterSearchDto,
} from "../types/hie.type";

export class BillOrderRepository {
  private repository: Repository<BillOrder>;

  constructor() {
    const connection = DatabaseManager.getInstance().getDataSource("primary");
    this.repository = connection.getRepository(BillOrder);
  }

  async findBillOrderBy(BillOrderFilter: BillOrderFilterSearchDto) {
    return this.repository.findOneBy(BillOrderFilter);
  }

  async saveRecord(billOrderDto: CreateBillOrderDto): Promise<BillOrder> {
    const existing = await this.repository.findOne({
      where: {
        ...billOrderDto,
      },
    });

    let record;

    if (existing) {
      record = {
        ...existing,
        ...billOrderDto,
      };
    } else {
      record = this.repository.create({
        ...billOrderDto,
      });
    }

    return this.repository.save(record);
  }
}
