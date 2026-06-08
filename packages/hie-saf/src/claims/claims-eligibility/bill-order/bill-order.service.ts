import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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
    if ('order_no' in createBillOrderDto) {
      const existingOrder = await this.billOrderRepository.findOne({
        where: {
          order_no: createBillOrderDto.order_no,
        },
      });
      if (existingOrder) {
        throw new HttpException(
          `An bill order with order no ${createBillOrderDto.order_no} already exisits`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if ('line_item_uuid' in createBillOrderDto) {
      const existingLineItem = await this.billOrderRepository.findOne({
        where: {
          line_item_uuid: createBillOrderDto.line_item_uuid,
        },
      });
      if (existingLineItem) {
        throw new HttpException(
          `An bill order with line item ${createBillOrderDto.line_item_uuid} already exisits`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
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
