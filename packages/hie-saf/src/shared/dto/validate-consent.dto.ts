import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateConsentDto {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsNotEmpty()
  @IsString()
  otp!: string;
}
