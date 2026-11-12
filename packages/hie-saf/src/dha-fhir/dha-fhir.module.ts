import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AMRS_CONNECTION } from '../core/database/db.module';
import { CaseSummaryModule } from '../case-summary/case-summary.module';
import { EmtModule } from '../emt/emt.module';
import { BasicAuthGuard } from '../auth/guards/basic-auth-guard/basic-auth.guard';
import { DhaFhirController } from './dha-fhir.controller';
import { DhaFhirResourcesService } from './dha-fhir-resources.service';

@Module({
  imports: [
    CaseSummaryModule,
    EmtModule,
    TypeOrmModule.forFeature([], AMRS_CONNECTION),
  ],
  controllers: [DhaFhirController],
  providers: [BasicAuthGuard, DhaFhirResourcesService],
})
export class DhaFhirModule {}
