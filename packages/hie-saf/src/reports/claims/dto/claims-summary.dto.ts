import { IsNotEmpty, IsString } from 'class-validator';
export class ClaimsSummaryDto {
  @IsNotEmpty()
  @IsString()
  startDate!: string;

  @IsNotEmpty()
  @IsString()
  endDate!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
