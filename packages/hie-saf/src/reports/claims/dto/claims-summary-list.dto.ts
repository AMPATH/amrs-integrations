import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
export class ClaimsSummaryListDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  startDate!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  endDate!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  providerStatus?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  payerStatus?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
