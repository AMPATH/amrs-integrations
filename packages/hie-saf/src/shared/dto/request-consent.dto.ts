import { IsNotEmpty, IsString } from 'class-validator';
import { ConsentScope } from '../../client-registry/types';
import { ApiProperty } from '@nestjs/swagger';

export class RequestConsentDto {
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
  phoneNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  scope!: ConsentScope[];
}
