import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddClaimLineRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  interventionCode!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  serviceName?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  serviceIdentifier?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  unitPrice!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  quantity!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  schemeCode?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
