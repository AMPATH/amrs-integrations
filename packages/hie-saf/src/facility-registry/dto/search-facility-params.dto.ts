import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SearchFacilityParamsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  filterType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  filterValue!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
