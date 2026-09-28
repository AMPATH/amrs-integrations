import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { ClaimSyncService } from './claim-sync.service';
import { ClaimsBatchSyncDto } from './dto/claims-batch-sync.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claims-sync')
export class ClaimSyncController {
  constructor(private claimSyncService: ClaimSyncService) {}
  @Post('batch-sync')
  public batchSyncClaims(@Body() body: ClaimsBatchSyncDto) {
    return this.claimSyncService.batchSyncClaims(body);
  }
}
