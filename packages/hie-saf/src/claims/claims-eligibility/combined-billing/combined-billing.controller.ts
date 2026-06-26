import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { AddCombinedBillingRequestDto } from './dto/add-combined-billing-request.dto';
import { CombinedBillingService } from './combined-billing.service';

@UseGuards(OpenMrsAuthGuard)
@Controller('combined-billing')
export class CombinedBillingController {
  constructor(
    private readonly combinedBillingService: CombinedBillingService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('attachments_0_file_blob'))
  public addCombinedBilling(
    @UploadedFile() file: any,
    @Body() body: AddCombinedBillingRequestDto,
  ) {
    return this.combinedBillingService.addCombinedBillingDetails(
      body,
      body.locationUuid,
      file,
    );
  }
}
