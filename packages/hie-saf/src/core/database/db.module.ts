import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacilityLocation } from './entities/facility-locations.entity';
import { BillOrder } from './entities/bill-order.entity';
import { HwrSync } from './entities/hwr_sync.entity';
import { ClaimVisit } from './entities/claim-visit.entity';
import { ClaimIntervention } from './entities/claim-intervention.entity';
import { ClaimDiagnosis } from './entities/claim-diagnosis.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        name: 'legacyConnection',
        type: 'mysql',
        host: configService.get<string>('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get<string>('DATABASE_USER'),
        password: configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DATABASE_NAME'),
        entities: [
          FacilityLocation,
          BillOrder,
          HwrSync,
          ClaimVisit,
          ClaimIntervention,
          ClaimDiagnosis,
        ],
        poolSize: configService.get<number>('DATABASE_POOL_SIZE'),
        synchronize: false,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [],
})
export class DatabaseModule {}
