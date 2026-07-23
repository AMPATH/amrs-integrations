import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClaimsVisitService } from './visit.service';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CreateClaimVisitDto } from './dto/create-claim-visit.dto';
import { ClaimVisitRequestDto } from './dto/get-claim-visit-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claims-visit')
export class ClaimsVisitController {
  constructor(private readonly claimsVisitService: ClaimsVisitService) {}
  @Post()
  createClaimsVisit(@Body() body: CreateClaimVisitDto) {
    if (!body.otp && !body.auth_guid) {
      throw new BadRequestException('Missing OTP and Auth Guid');
    }
    return this.claimsVisitService.createClaimsVisit(body);
  }
  @Get()
  getPatientClaimVisit(@Query() query: ClaimVisitRequestDto) {
    if (Object.keys(query).length === 0) {
      throw new BadRequestException('Missing params');
    }
    return this.claimsVisitService.find(query);
  }
}
