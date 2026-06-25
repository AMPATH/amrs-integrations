import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SearchHealthWorkerParamsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identifierType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identifierValue!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
