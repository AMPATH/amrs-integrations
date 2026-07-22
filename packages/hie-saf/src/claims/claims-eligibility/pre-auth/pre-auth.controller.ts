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
import { CreateNormalPreAuthRequestDto } from './dto/create-normal-pre-auth.request.dto';
import { PreAuthService } from './pre-auth.service';


@UseGuards(OpenMrsAuthGuard)
@Controller('pre-auth')
export class PreAuthController {
  constructor(private readonly preAuthService: PreAuthService) {}
  @Post('normal')
  @UseInterceptors(FileInterceptor('fileBlob'))
  public createNormalPreAuth(
    @UploadedFile() file: any,
    @Body() body: CreateNormalPreAuthRequestDto,
  ) {
    return this.preAuthService.createNormalPreauth(
      body,
      body.locationUuid,
      file,
    );
  }
}
