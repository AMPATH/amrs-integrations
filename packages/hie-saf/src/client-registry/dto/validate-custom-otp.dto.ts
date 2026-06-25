import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateCustomOtpParamsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  sessionId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  otp!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
