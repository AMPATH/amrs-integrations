import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ClientEligibilitySearchDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identificationType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identificationNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
