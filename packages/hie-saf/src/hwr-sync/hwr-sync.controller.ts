import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { HwrBatchSyncDto } from './dto/hwr-batch-sync.dto';
import { HwrSyncService } from './hwr-sync.service';

@UseGuards(OpenMrsAuthGuard)
@Controller('hwr')
export class HwrSyncController {
  constructor(private hwrSyncService: HwrSyncService) {}
  @Post('batch-sync')
  public batchSyncHealthWorkerRecords(@Body() body: HwrBatchSyncDto) {
    return this.hwrSyncService.batchSyncHealthWorkerRecords(body);
  }
}
