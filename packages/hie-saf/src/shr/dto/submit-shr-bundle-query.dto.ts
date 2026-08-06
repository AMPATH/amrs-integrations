import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Query params for POST /shr/bundles — the body is the FHIR Bundle itself. */
export class SubmitShrBundleQueryDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @ApiProperty({
    required: false,
    description:
      'Per visit consent token. Prefer the X-Consent-Token header; this param is the fallback.',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  consentToken?: string;
}
