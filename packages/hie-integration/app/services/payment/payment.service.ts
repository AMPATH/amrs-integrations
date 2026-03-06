import { PaymentRepository } from "../../repositories/PaymentRepository";
import { CreatePaymentDto, PaymentFilterSearchDto } from "../../types/hie.type";
import { logger } from "../../utils/logger";

export class PaymentService {
  private repository: PaymentRepository;
  constructor() {
    this.repository = new PaymentRepository();
  }
  public async findOneBy(paymentFilter: PaymentFilterSearchDto) {
    try {
      const payment = await this.repository.findPaymentBy(paymentFilter);
      if (payment) {
        return payment;
      } else {
        return [];
      }
    } catch (error: any) {
      logger.error(`Payment fetch error: ${error.message}`);
      throw new Error(
        error.message ?? "An error occurred while fetching payment record",
      );
    }
  }
  public async create(createPaymentDto: CreatePaymentDto) {
    try {
      const resp = await this.repository.saveRecord(createPaymentDto);
      return resp;
    } catch (error: any) {
      logger.error(`Payment creation error: ${error.message}`);
      throw new Error(
        error.message ?? "An error occurred while creating payment record",
      );
    }
  }
}
