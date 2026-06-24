import { Module } from '@nestjs/common';
import { ClientRegistryController } from './client-registry.controller';
import { ClientRegistryService } from './client-registry.service';
import { HieHttpRequestModule } from '../hie-http-request/hie-http-request.module';
import { ConsentModule } from '../consent/consent.module';
import { LocationFacilityHelper } from '../shared/utils/location-facility.helper';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacilityLocation } from '../core/database/entities/facility-locations.entity';
import { ContactsService } from '../consent/contacts/contacts.service';

@Module({
  imports: [
    HieHttpRequestModule,
    ConsentModule,
    TypeOrmModule.forFeature([FacilityLocation]),
  ],
  controllers: [ClientRegistryController],
  providers: [ClientRegistryService, LocationFacilityHelper, ContactsService],
})
export class ClientRegistryModule {}
