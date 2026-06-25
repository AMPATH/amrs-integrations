import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FetchFacilityDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  'identifier-type'!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identifier!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
