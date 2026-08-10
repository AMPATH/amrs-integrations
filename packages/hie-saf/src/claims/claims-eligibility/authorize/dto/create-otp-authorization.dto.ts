import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** OTP variant of POST /api/v1/claims/authorize (pre-visit elective consent). */
export class CreateOtpAuthorizationDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  otp!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  interventions!: string[];

  @ApiProperty({ example: 'OUTPATIENT' })
  @IsNotEmpty()
  @IsString()
  service_type!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  beneficiary_contact_id?: string;

  /**
   * Accepted from callers but NOT forwarded to HIE.
   * is_elective on authorize means day-of elective visit (requires approved preauth).
   */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsBoolean()
  isElective?: boolean;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsBoolean()
  is_elective?: boolean;
}
