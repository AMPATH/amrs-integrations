import { IsNotEmpty, IsString } from 'class-validator';

export class BedOccupancyDto {
  @IsNotEmpty()
  @IsString()
  facility_code!: string;
}
