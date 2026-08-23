import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * List the visits at a facility that still hold an open consent for a patient.
 * `facility_id` is resolved server side from `locationUuid`, the same way the
 * consent request resolves it.
 *
 * Worth calling before starting a fresh consent request: a patient who already
 * has an open visit here cannot start another, and its token can be refreshed
 * instead of putting the patient through a second OTP.
 *
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 */
export class ListOpenVisitsDto {
  @ApiProperty({ description: 'Client Registry identifier of the patient' })
  @IsNotEmpty()
  @IsString()
  crId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
