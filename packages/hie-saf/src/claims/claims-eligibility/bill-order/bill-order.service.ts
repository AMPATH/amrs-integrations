import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  async findOne(searchBillOrderDto: SearchBillOrderDto) {
    const billOrder = await this.billOrderRepository.findOneBy({
      ...searchBillOrderDto,
    });
    if (billOrder) {
      return billOrder;
    } else {
      throw new NotFoundException(
        'Bill with the given order or uuid does not exisit',
      );
    }
  }

  async findBillOrderByPatientUuidWithBlankConsentToken(
    patient_uuid: string,
  ) {
    const billOrder = await this.billOrderRepository
      .createQueryBuilder('bill_order')
      .where('bill_order.patient_uuid = :patient_uuid', {
        patient_uuid,
      })
      .andWhere(
        '(bill_order.consent_token IS NULL OR bill_order.consent_token = \'\')',
      )
      .andWhere(
        'bill_order.sub_benefit_code IS NOT NULL AND bill_order.sub_benefit_code != \'\'',
      )
      .andWhere(
        'bill_order.intervention_code IS NOT NULL AND bill_order.intervention_code != \'\'',
      )
      .getMany();

    if (billOrder) {
      return billOrder;
    } else {
      throw new NotFoundException(
        'Bill with the given patient uuid does not exist',
      );
    }
  }

  async updateBillOrderConsentToken(id: string, consent_token: string) {
    const result = await this.billOrderRepository.update(
      { id },
      { consent_token },
    );

    if (result.affected === 0) {
      throw new NotFoundException(
        'Bill order with the given id does not exist',
      );
    }

    return { message: 'Consent token updated successfully', id, consent_token };
  }
}
