import { BillOrderRepository } from "../../repositories/BillOrderRepository";
import {
  CreateBillOrderDto,
  BillOrderFilterSearchDto,
} from "../../types/hie.type";
import { logger } from "../../utils/logger";

export class BillOrderService {
  private repository: BillOrderRepository;
  constructor() {
    this.repository = new BillOrderRepository();
  }
  public async findOneBy(BillOrderFilter: BillOrderFilterSearchDto) {
    try {
      const BillOrder = await this.repository.findBillOrderBy(BillOrderFilter);
      if (BillOrder) {
        return BillOrder;
      } else {
        return undefined;
      }
    } catch (error: any) {
      logger.error(`BillOrder fetch error: ${error.message}`);
      throw new Error(
        error.message ?? "An error occurred while fetching BillOrder record",
      );
    }
  }
  public async create(createBillOrderDto: CreateBillOrderDto) {
    try {
      const resp = await this.repository.saveRecord(createBillOrderDto);
      return resp;
    } catch (error: any) {
      logger.error(`BillOrder creation error: ${error.message}`);
      throw new Error(
        error.message ?? "An error occurred while creating BillOrder record",
      );
    }
  }
}
