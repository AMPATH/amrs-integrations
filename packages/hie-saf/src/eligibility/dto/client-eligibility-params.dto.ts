import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ClientEligibilityParamsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  requestIdNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  requestIdType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
