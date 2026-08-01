import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SearchPreAuthDto {
  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  consentToken?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  patientUuid?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  interventionCode?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  locationUuid?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  status?: string;
}
