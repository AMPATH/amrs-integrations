import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateCustomOtpParamsDto {
  @IsNotEmpty()
  @IsString()
  sessionId!: string;

  @IsNotEmpty()
  @IsString()
  otp!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
