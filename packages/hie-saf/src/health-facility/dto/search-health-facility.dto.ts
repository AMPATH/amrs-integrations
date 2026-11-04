import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SearchHealthFacilityDto {
  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  q!: string;
}
