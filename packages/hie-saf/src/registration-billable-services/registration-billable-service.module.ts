import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationBillableService } from '../core/database/entities/registration-billable-services.entity';
import { RegistrationBillableServiceController } from './registration-billable-services.controller';
import { RegistrationBillableServiceService } from './registration-billable-services.service';

@Module({
  imports: [TypeOrmModule.forFeature([RegistrationBillableService])],
  controllers: [RegistrationBillableServiceController],
  providers: [RegistrationBillableServiceService],
})
export class RegistrationBillableServiceModule {}
