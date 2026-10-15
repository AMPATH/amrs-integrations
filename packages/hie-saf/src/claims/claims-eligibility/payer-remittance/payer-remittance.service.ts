import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { PayerRemittanceDto } from './dto/payer-remittance.dto';
import { ReconciliationBundle } from './types/index';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PayerRemittance } from '../../../core/database/entities/payer-remittance';
import { ClaimVisit } from 'src/core/database/entities/claim-visit.entity';

@Injectable()
export class PayerRemittanceService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
    @InjectRepository(PayerRemittance)
    private payerRemittanceRepository: Repository<PayerRemittance>,
    @InjectRepository(ClaimVisit)
    private claimVisitRepository: Repository<ClaimVisit>,
    private readonly dataSource: DataSource,
  ) {}
  async fetchPayerRemittance(payerRemittanceDto: PayerRemittanceDto) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const payerRemittanceUrl = `${baseUrl}/api/v1/claims/payer-remittance/${payerRemittanceDto.claimGuid}`;
    return this.getBillDetailsFromClaimsGuid(
      payerRemittanceDto.claimGuid ?? '',
    );
    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        payerRemittanceUrl,
        payerRemittanceDto.locationUuid,
      );
      const data = (await response.json()) as ReconciliationBundle;
      try {
        const payerRemittanceEntity = this.payerRemittanceRepository.create({
          claimGuid: payerRemittanceDto.claimGuid,
          payerRemittanceResponse: data,
        });
        await this.payerRemittanceRepository.save(payerRemittanceEntity);
      } catch (error) {
        Logger.log(error);
      }
      return data ?? null;
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error fetching payer remittance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  private async getBillDetailsFromClaimsGuid(claimsGuid: string) {
    const query = `
      SELECT 
        cv.claim_visit_id,
        cv.invoice_no,
        cb.bill_id,
        cb.uuid AS bill_uuid,
        SUM(cbl.price) AS total_price,
        cbl.price_name,
        cbs.name AS billable_service,
        cip.uuid AS price_uuid,
        cip.name AS price_name_alt,
        cip.payment_mode,
        cpm.uuid AS payment_mode_uuid
      FROM hie.claim_visit cv
      JOIN amrs.cashier_bill cb ON (cv.invoice_no = cb.receipt_number)
      JOIN amrs.cashier_bill_line_item cbl ON (cb.bill_id = cbl.bill_id)
      JOIN amrs.cashier_billable_service cbs ON (cbl.service_id = cbs.service_id)
      LEFT JOIN amrs.cashier_item_price cip ON (cbs.service_id = cip.service_id AND cbl.price_name = cip.name)
      LEFT JOIN amrs.cashier_payment_mode cpm ON (cpm.payment_mode_id = cip.payment_mode)
      WHERE cv.claim_visit_id = ?
      GROUP BY cv.claim_visit_id
    `;

    return await this.dataSource.query(query, [claimsGuid]);
  }
}
