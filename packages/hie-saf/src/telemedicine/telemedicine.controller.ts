import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { RequestTelemedicineSessionDto } from './dto/request-telemedicine-session.dto';
import { TelemedicineService } from './telemedicine.service';
import { LiviaSsoTokenResponse } from './types';

/**
 * `POST /telemedicine/sso/token` — mint a partner telemedicine (Livia)
 * single-sign-on session for the logged-in practitioner at the caller's
 * facility:
 *
 *   { nationalId, locationUuid } → { code, expires_in, redirect_url }
 *
 * The `OpenMrsAuthGuard` validates the caller's `JSESSIONID` before this runs,
 * so the request rides an authenticated OpenMRS session like every other
 * route here. The partner credentials and the facility resolution live in
 * `TelemedicineService`; the caller only supplies who the session is for and
 * where it is being requested from.
 */
@UseGuards(OpenMrsAuthGuard)
@Controller('telemedicine')
export class TelemedicineController {
  constructor(private readonly telemedicineService: TelemedicineService) {}

  @Post('sso/token')
  requestSsoToken(
    @Body() body: RequestTelemedicineSessionDto,
  ): Promise<LiviaSsoTokenResponse> {
    return this.telemedicineService.requestSsoToken(body);
  }
}
