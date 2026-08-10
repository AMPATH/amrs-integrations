import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InterventionsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @ApiPropertyOptional({
    description:
      'Sub-benefit package code. Optional when `code` is provided for a single-intervention lookup.',
  })
  @IsOptional()
  @IsString()
  sub_benefit_code?: string;

  @ApiPropertyOptional({
    description: 'SHA intervention code (e.g. SHA-06-031)',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
