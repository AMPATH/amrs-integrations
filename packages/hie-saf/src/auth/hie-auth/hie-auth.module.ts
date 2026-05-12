import { Module } from '@nestjs/common';
import { HieAuthController } from './hie-auth.controller';
import { HieAuthService } from './hie-auth.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [],
  controllers: [HieAuthController],
  providers: [HieAuthService, ConfigService],
})
export class HieAuthModule {}
