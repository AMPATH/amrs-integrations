import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BillOrder } from '../../../core/database/entities/bill-order.entity';
import { Repository } from 'typeorm';
import { CreateBillOrderDto } from './dto/create-bill-order.dto';
import { SearchBillOrderDto } from './dto/search-bill-order.dto';

@Injectable()
export class BillOrderService {
  constructor(
    @InjectRepository(BillOrder)
    private billOrderRepository: Repository<BillOrder>,
  ) {}
  async createBillOrder(createBillOrderDto: CreateBillOrderDto) {
    const existing = await this.billOrderRepository.findOne({
      where: {
        ...createBillOrderDto,
      },
    });

    let record;

    if (existing) {
      record = {
        ...existing,
        ...createBillOrderDto,
      };
    } else {
      record = this.billOrderRepository.create({
        ...createBillOrderDto,
      });
    }
    return this.billOrderRepository.save(record);
  }
  findOne(searchBillOrderDto: SearchBillOrderDto) {
    return this.billOrderRepository.findOneBy({
      ...searchBillOrderDto,
    });
  }
}
