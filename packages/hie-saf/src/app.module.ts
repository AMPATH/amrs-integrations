import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HieAuthModule } from './auth/hie-auth/hie-auth.module';
import { ConfigModule } from '@nestjs/config';
import { ClientRegistryModule } from './client-registry/client-registry.module';
import { EligibilityModule } from './eligibility/eligibility.module';
import { FacilityRegistryModule } from './facility-registry/facility-registry.module';
import * as Joi from 'joi';
import { HieHttpRequestModule } from './hie-http-request/hie-http-request.module';
import { HealthWorkerRegistryModule } from './health-worker-registry/health-worker-registry.module';
import { ConsentModule } from './consent/consent.module';
import { ClaimsModule } from './claims/claims.module';
import { OpenMrsAuthGuard } from './auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { DatabaseModule } from './core/database/db.module';
import { LocationFacilityHelper } from './shared/utils/location-facility.helper';
import { FacilityLocation } from './core/database/entities/facility-locations.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    HieAuthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        HIE_AUTH_URL: Joi.string().required(),
        HIE_CLIENT_ID: Joi.string().required(),
        HIE_CLIENT_SECRET: Joi.string().required(),
        HIE_GRANT_TYPE: Joi.string().required(),
        HIE_BASE_URL: Joi.string().required(),
        HIE_CLIAMS_BASE_URL: Joi.string().required(),
        DATABASE_HOST: Joi.string().required(),
        DATABASE_PORT: Joi.number().required(),
        DATABASE_USER: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        APP_ENV: Joi.string().required(),
      }),
    }),
    DatabaseModule,
    ClientRegistryModule,
    EligibilityModule,
    FacilityRegistryModule,
    HieHttpRequestModule,
    HealthWorkerRegistryModule,
    ConsentModule,
    ClaimsModule,
    TypeOrmModule.forFeature([FacilityLocation]),
  ],
  controllers: [AppController],
  providers: [AppService, OpenMrsAuthGuard, LocationFacilityHelper],
})
export class AppModule {}
