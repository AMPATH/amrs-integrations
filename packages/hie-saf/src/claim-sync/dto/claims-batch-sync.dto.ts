import { IsNotEmpty, IsString } from 'class-validator';
export class ClaimsBatchSyncDto {
  @IsNotEmpty()
  @IsString()
  location_uuid!: string;

  @IsNotEmpty()
  @IsString()
  startDate!: string;

  @IsNotEmpty()
  @IsString()
  endDate!: string;
}
