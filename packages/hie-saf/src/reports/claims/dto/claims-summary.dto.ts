import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
export class ClaimsSummaryDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  startDate!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  endDate!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
