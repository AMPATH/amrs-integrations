import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Notify the receiving practitioner that an EMT ambulance handover is ready
 * to be accepted. `identifier`/`identifier_type`/`regulator` are resolved
 * server side from the logged in provider — never accepted from the client,
 * so the endpoint cannot be spoofed into notifying an arbitrary doctor.
 * @see https://hie-docs.dha.go.ke/eclaims/emt-handover
 */
export class InitiateEmtHandoverDto {
  @ApiProperty({
    description: 'case_number of the referral, from GET /emt/referrals',
    example: 'AMB-d22419d8-6d36-4b2f-a33c-3e008bd85f77-FAC',
  })
  @IsNotEmpty()
  @IsString()
  incidenceNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
