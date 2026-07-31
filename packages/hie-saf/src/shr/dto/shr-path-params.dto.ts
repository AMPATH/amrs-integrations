import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** `:consentId` on the consent lifecycle routes. */
export class ShrConsentParamsDto {
  @ApiProperty({ description: 'consent_id returned by POST /shr/consents' })
  @IsNotEmpty()
  @IsString()
  consentId!: string;
}

/** `:visitId` on the visit routes. */
export class ShrVisitParamsDto {
  @ApiProperty({ description: 'visit_id returned once consent is approved' })
  @IsNotEmpty()
  @IsString()
  visitId!: string;
}
