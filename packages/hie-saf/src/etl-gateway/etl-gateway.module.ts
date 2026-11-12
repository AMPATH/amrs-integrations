import { Module } from '@nestjs/common';
import { BasicAuthGuard } from '../auth/guards/basic-auth-guard/basic-auth.guard';
import { EtlProxyController } from './etl-gateway.controller';

@Module({
  controllers: [EtlProxyController],
  providers: [BasicAuthGuard],
})
export class EtlGatewayModule {}
