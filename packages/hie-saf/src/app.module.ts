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
      }),
    }),
    ClientRegistryModule,
    EligibilityModule,
    FacilityRegistryModule,
    HieHttpRequestModule,
    HealthWorkerRegistryModule,
    ConsentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
