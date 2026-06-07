import { IsNotEmpty, IsString } from 'class-validator';

export class BedOccupancyDto {
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
