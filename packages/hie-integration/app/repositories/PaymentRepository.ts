import { Repository } from "typeorm";
import { DatabaseManager } from "../config/database";
import { Payment } from "../models/Payment";
import { CreatePaymentDto, PaymentFilterSearchDto } from "../types/hie.type";

export class PaymentRepository {
  private repository: Repository<Payment>;

  constructor() {
    const connection = DatabaseManager.getInstance().getDataSource("primary");
    this.repository = connection.getRepository(Payment);
  }

  async findPaymentBy(paymentFilter: PaymentFilterSearchDto) {
    return this.repository.findOneBy(paymentFilter);
  }

  async saveRecord(paymentDto: CreatePaymentDto): Promise<Payment> {
    const existing = await this.repository.findOne({
      where: {
        payment_uuid: paymentDto.payment_uuid,
      },
    });

    let record;

    if (existing) {
      record = {
        ...existing,
        ...paymentDto,
      };
    } else {
      record = this.repository.create({
        ...paymentDto,
      });
    }

    return this.repository.save(record);
  }
}
