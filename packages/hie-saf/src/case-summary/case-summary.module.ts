import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AMRS_CONNECTION } from '../core/database/db.module';
import { CaseSummaryController } from './case-summary.controller';
import { CaseSummaryService } from './case-summary.service';
import { LabResultHelper } from './utils/lab-result.helper';
import { SoapNoteHelper } from './utils/soap-note.helper';
import { VisitWindowHelper } from './utils/visit-window.helper';

@Module({
  imports: [TypeOrmModule.forFeature([], AMRS_CONNECTION)],
  controllers: [CaseSummaryController],
  providers: [
    CaseSummaryService,
    LabResultHelper,
    VisitWindowHelper,
    SoapNoteHelper,
  ],
})
export class CaseSummaryModule {}
