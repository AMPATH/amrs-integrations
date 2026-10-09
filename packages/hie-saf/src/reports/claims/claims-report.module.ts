import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaimVisit } from 'src/core/database/entities/claim-visit.entity';
import { ClaimsReportController } from './claims-report.controller';
import { ClaimsReportService } from './claims-report.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClaimVisit])],
  providers: [ClaimsReportService],
  controllers: [ClaimsReportController],
})
export class ClaimsReportModule {}
