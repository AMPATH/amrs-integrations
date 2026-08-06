import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { InitiateEmtHandoverDto } from './dto/initiate-emt-handover.dto';
import { ListEmtReferralsDto } from './dto/list-emt-referrals.dto';
import { VerifyEmtHandoverDto } from './dto/verify-emt-handover.dto';
import { EmtService } from './emt.service';

/**
 * DHA EMT ambulance handover — list referrals awaiting action, initiate a
 * handover to the logged in practitioner, and verify the OTP that confirms
 * it. The receiving practitioner's identity is always resolved server side
 * from the OpenMRS session, never taken from the request body.
 */
@UseGuards(OpenMrsAuthGuard)
@Controller('emt')
export class EmtController {
  constructor(private readonly emtService: EmtService) {}

  @Get('referrals')
  listReferrals(@Query() query: ListEmtReferralsDto) {
    return this.emtService.listReferrals(query);
  }

  @Post('handover/initiate')
  initiateHandover(
    @Body() body: InitiateEmtHandoverDto,
    @Req() request: Request,
  ) {
    return this.emtService.initiateHandover(
      body,
      request.cookies?.['JSESSIONID'] as string | undefined,
    );
  }

  @Post('handover/verify')
  verifyHandover(@Body() body: VerifyEmtHandoverDto) {
    return this.emtService.verifyHandover(body);
  }
}
