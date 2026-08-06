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
import { HwrSyncModule } from './hwr-sync/hwr-sync.module';
import { BiometricsService } from './consent/biometrics/biometrics.service';
import { ShrModule } from './shr/shr.module';
import { CaseSummaryModule } from './case-summary/case-summary.module';
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
        HIE_SHR_BASE_URL: Joi.string().required(),
        DATABASE_HOST: Joi.string().required(),
        DATABASE_PORT: Joi.number().required(),
        DATABASE_USER: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        APP_ENV: Joi.string().required(),
        AMRS_DATABASE_HOST: Joi.string().required(),
        AMRS_DATABASE_PORT: Joi.number().required(),
        AMRS_DATABASE_USER: Joi.string().required(),
        AMRS_DATABASE_PASSWORD: Joi.string().required(),
        AMRS_DATABASE_NAME: Joi.string().required(),
        AMRS_DATABASE_POOL_SIZE: Joi.number().default(4),
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
    HwrSyncModule,
    ShrModule,
    CaseSummaryModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    OpenMrsAuthGuard,
    LocationFacilityHelper,
    BiometricsService,
  ],
})
export class AppModule {}
