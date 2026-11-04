import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SearchHealthFacilityDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  officialName!: string;
}
