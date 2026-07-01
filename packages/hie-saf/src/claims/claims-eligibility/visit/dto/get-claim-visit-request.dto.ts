import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClaimVisitRequestDto {
  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  consentToken?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  locationUuid?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  visitDate?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patientId!: string;
}
