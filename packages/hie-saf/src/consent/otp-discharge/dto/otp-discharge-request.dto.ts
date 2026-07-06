import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class OtpDischargeRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patientId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
