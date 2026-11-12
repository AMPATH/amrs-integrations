import { Module } from '@nestjs/common';
import { BasicAuthGuard } from '../auth/guards/basic-auth-guard/basic-auth.guard';
import { DhaFhirController } from './dha-fhir.controller';

@Module({
  controllers: [DhaFhirController],
  providers: [BasicAuthGuard],
})
export class DhaFhirModule {}
