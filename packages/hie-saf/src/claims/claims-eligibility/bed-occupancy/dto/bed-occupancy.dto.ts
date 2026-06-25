import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class BedOccupancyDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
