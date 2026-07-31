import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Read a patient's Shared Health Record. `practitioner_id` is derived from the
 * logged in provider, never from the client.
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-records
 */
export class FetchPatientRecordsDto {
  @ApiProperty({ description: 'Client Registry identifier of the patient' })
  @IsNotEmpty()
  @IsString()
  crId!: string;

  @ApiProperty({
    description: 'Comma separated FHIR resource types to return',
    example: 'Observation,Condition',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Za-z]+(,[A-Za-z]+)*$/, {
    message: 'resources must be a comma separated list of FHIR resource types',
  })
  resources!: string;

  @ApiProperty({
    required: false,
    description:
      'Per visit consent token. Prefer the X-Consent-Token header; this param is the fallback.',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  consentToken?: string;

  @ApiProperty({
    required: false,
    description: 'Filter to a single resource by logical id',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  _id?: string;

  @ApiProperty({
    required: false,
    description: 'Pagination token from a previous response',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  pageToken?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
