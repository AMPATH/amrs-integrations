import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePreAuthRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consentToken?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patientUuid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  orderNo!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  subBenefitCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  interventionCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  serviceType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billableServiceUuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priceUuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  encounterUuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedServiceStartDate?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  requiresPreauth!: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  normalPreauth!: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  electivePreauth!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  applicableDocumentTypes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requiredPreauthDocumentTypes?: string;
}
