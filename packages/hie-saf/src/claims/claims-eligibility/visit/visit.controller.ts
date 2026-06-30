import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClaimsVisitService } from './visit.service';
import { OpenMrsAuthGuard } from '../../../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { CreateClaimVisitDto } from './dto/create-claim-visit.dto';
import { FacilityClaimVisitRequestDto } from './dto/facility-claim-visits-request.dto';

@UseGuards(OpenMrsAuthGuard)
@Controller('claims-visit')
export class ClaimsVisitController {
  constructor(private readonly claimsVisitService: ClaimsVisitService) {}
  @Post()
  createClaimsVisit(@Body() body: CreateClaimVisitDto) {
    return this.claimsVisitService.createClaimsVisit(body);
  }
  @Post('facility')
  getFacilityClaimVisits(@Body() body: FacilityClaimVisitRequestDto) {
    return this.claimsVisitService.getFacilityClaimVisits(body);
  }
}
