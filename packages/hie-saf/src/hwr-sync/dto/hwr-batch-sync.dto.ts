import { IsNotEmpty, IsString } from 'class-validator';
export class HwrBatchSyncDto {
  @IsNotEmpty()
  @IsString()
  location_uuid!: string;
}
