import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Mint a partner telemedicine SSO session scoped to one patient consult —
 * the patient-chart variant of `RequestTelemedicineSessionDto`.
 *
 * The `doctorNationalId` is the consulting practitioner's and the
 * `patientNationalId` identifies who the consult is for; both are read off
 * OpenMRS by the workflow app (provider attribute / patient identifier). The
 * `consentToken` is the visit's claim consent token, when there is one — it
 * ties the minted session to the consent the patient gave for this visit, and
 * is entirely optional. The `locationUuid` resolves the facility the request
 * is scoped to, which is what picks the `facility_code` the partner needs.
 */
export class RequestPatientTelemedicineSessionDto {
  @ApiProperty({
    description:
      'National ID of the practitioner the telemedicine session is minted for',
  })
  @IsNotEmpty()
  @IsString()
  doctorNationalId!: string;

  @ApiProperty({
    description: 'National ID of the patient the consult session is for',
  })
  @IsNotEmpty()
  @IsString()
  patientNationalId!: string;

  @ApiPropertyOptional({
    description:
      'The visit’s claim consent token, when there is one — ties the ' +
      'session to the consent the patient gave for this visit',
  })
  @IsOptional()
  @IsString()
  consentToken?: string;

  @ApiProperty({
    description:
      'OpenMRS location UUID of the facility requesting the session — ' +
      'resolves the facility code sent to the partner',
  })
  @IsUUID()
  locationUuid!: string;
}
