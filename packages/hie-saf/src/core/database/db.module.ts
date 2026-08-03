import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacilityLocation } from './entities/facility-locations.entity';
import { BillOrder } from './entities/bill-order.entity';
import { HwrSync } from './entities/hwr_sync.entity';
import { ClaimVisit } from './entities/claim-visit.entity';
import { ClaimIntervention } from './entities/claim-intervention.entity';
import { ClaimDiagnosis } from './entities/claim-diagnosis.entity';
import { ClaimLine } from './entities/claime-line.entity';
import { ClaimAttachment } from './entities/claim-attachment.entity';

/** Name of the read-only AMRS OpenMRS connection — see `CaseSummaryModule`. */
export const AMRS_CONNECTION = 'amrsConnection';

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
          ClaimLine,
          ClaimAttachment,
        ],
        poolSize: configService.get<number>('DATABASE_POOL_SIZE'),
        synchronize: false,
      }),
      inject: [ConfigService],
    }),
    /**
     * Read-only connection to the AMRS OpenMRS database, for `case-summary`'s
     * direct SQL reads (see docs/case-summary-endpoint.md §2, §4.6). Credentials
     * are `SELECT`-only and, per §5.1, should point at a read replica.
     *
     * `entities: []` and `synchronize: false` are both deliberate: mapping
     * OpenMRS tables to entities would invite writes and schema coupling, so
     * this connection is for `dataSource.query(sql, params)` reads only.
     *
     * `dateStrings: true` means every datetime/timestamp column comes back as
     * the raw MySQL string, not a driver-parsed `Date` — required for the
     * day-granular, no-timezone-reinterpretation comparisons documented in
     * `utils/visit-window.helper.ts`.
     */
    TypeOrmModule.forRootAsync({
      name: AMRS_CONNECTION,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        name: AMRS_CONNECTION,
        type: 'mysql',
        host: configService.get<string>('AMRS_DATABASE_HOST'),
        port: configService.get<number>('AMRS_DATABASE_PORT'),
        username: configService.get<string>('AMRS_DATABASE_USER'),
        password: configService.get<string>('AMRS_DATABASE_PASSWORD'),
        database: configService.get<string>('AMRS_DATABASE_NAME'),
        poolSize: configService.get<number>('AMRS_DATABASE_POOL_SIZE'),
        dateStrings: true,
        entities: [],
        synchronize: false,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [],
})
export class DatabaseModule {}
