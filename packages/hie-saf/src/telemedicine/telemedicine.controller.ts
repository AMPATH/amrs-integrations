import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OpenMrsAuthGuard } from '../auth/guards/openmrs-auth-guard/openmrs-auth.guard';
import { RequestTelemedicineSessionDto } from './dto/request-telemedicine-session.dto';
import { RequestPatientTelemedicineSessionDto } from './dto/request-patient-telemedicine-session.dto';
import { TelemedicineService } from './telemedicine.service';
import { LiviaSsoTokenResponse } from './types';

/**
 * `POST /telemedicine/sso/token` — mint a partner telemedicine (Livia)
 * single-sign-on session for the logged-in practitioner at the caller's
 * facility:
 *
 *   { nationalId, locationUuid } → { code, expires_in, redirect_url }
 *
 * `POST /telemedicine/sso/patient-token` — the patient-chart variant, scoped
 * to one consult:
 *
 *   { doctorNationalId, patientNationalId, consentToken?, locationUuid }
 *     → { code, expires_in, redirect_url }
 *
 * The `OpenMrsAuthGuard` validates the caller's `JSESSIONID` before these run,
 * so the requests ride an authenticated OpenMRS session like every other
 * route here. The partner credentials and the facility resolution live in
 * `TelemedicineService`; the callers only supply who the session is for and
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

  @Post('sso/patient-token')
  requestPatientSsoToken(
    @Body() body: RequestPatientTelemedicineSessionDto,
  ): Promise<LiviaSsoTokenResponse> {
    return this.telemedicineService.requestPatientSsoToken(body);
  }
}
