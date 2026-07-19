import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ClaimAuthorizationsRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  beneficiaryCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
