import { IsNotEmpty, IsString } from 'class-validator';
import { Regulators } from '../types';
import { ApiProperty } from '@nestjs/swagger';

export class FetchHealthWorkerDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  regulator!: Regulators;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identifierType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identifierNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
