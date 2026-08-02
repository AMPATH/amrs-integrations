import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreatePreAuthRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

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

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  billableServiceUuid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  priceUuid!: string;

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

  @ApiProperty()
  @IsString()
  applicableDocumentTypes!: string;

  @ApiProperty()
  @IsString()
  requiredPreauthDocumentTypes!: string;
}
