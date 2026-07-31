import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Verify an SHR consent with the OTP the patient received. Returns the
 * `consent_token` used as `X-Consent-Token` when reading records.
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 */
export class VerifyShrConsentDto {
  @ApiProperty({ description: 'OTP the patient received' })
  @IsNotEmpty()
  @IsString()
  otp!: string;

  @ApiProperty({
    description:
      'OTP record reference from the consent request (or from the latest resend-otp call)',
  })
  @IsNotEmpty()
  @IsString()
  otpRecord!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
