import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Ask for a ready-to-use consent token for a patient at a facility, without the
 * caller having to hold `visit_id` or `consent_id` itself.
 *
 * Answered from the locally recorded consent session where possible, and
 * otherwise by asking DHA for the patient's open visits and refreshing one —
 * see `ShrService.getActiveConsent`.
 *
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 */
export class GetActiveConsentDto {
  @ApiProperty({ description: 'Client Registry identifier of the patient' })
  @IsNotEmpty()
  @IsString()
  crId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
