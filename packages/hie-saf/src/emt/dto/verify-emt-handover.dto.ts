import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Verify the OTP sent to the receiving practitioner to confirm an EMT
 * ambulance handover.
 * @see https://hie-docs.dha.go.ke/eclaims/emt-handover
 */
export class VerifyEmtHandoverDto {
  @ApiProperty({ example: 'AMB-d22419d8-6d39-4b2f-a33c-3e008bd85f77-FAC' })
  @IsNotEmpty()
  @IsString()
  incidenceNumber!: string;

  @ApiProperty({
    description: 'request_id returned by POST /emt/handover/initiate',
    example: '82fd22b6-e366-4077-9866-e1c4ed7328b0',
  })
  @IsNotEmpty()
  @IsString()
  requestId!: string;

  @ApiProperty({
    description: 'OTP the receiving practitioner received',
    example: '623415',
  })
  @IsNotEmpty()
  @IsString()
  otp!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
