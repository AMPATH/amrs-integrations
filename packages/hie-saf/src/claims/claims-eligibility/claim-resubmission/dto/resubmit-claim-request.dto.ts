import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ResubmitClaimRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
