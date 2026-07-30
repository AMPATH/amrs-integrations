import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * Resend preauth doctor approval request.
 * @see https://hie-docs.dha.go.ke/eclaims/preauth-doctor-consent
 */
export class ResendDoctorConsentDto {
  @ApiProperty({ example: 'A7000' })
  @IsNotEmpty()
  @IsString()
  practitioner_registration_number!: string;

  @ApiProperty({
    enum: ['PREAUTH_DOCTOR_APPROVAL_REQUEST'],
    example: 'PREAUTH_DOCTOR_APPROVAL_REQUEST',
  })
  @IsNotEmpty()
  @IsIn(['PREAUTH_DOCTOR_APPROVAL_REQUEST'])
  request_type!: 'PREAUTH_DOCTOR_APPROVAL_REQUEST';

  @ApiProperty({ example: 'K5HLPJVDNV' })
  @IsNotEmpty()
  @IsString()
  consent_token!: string;

  @ApiProperty({ example: 'SHA-06-031' })
  @IsNotEmpty()
  @IsString()
  intervention_code!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
