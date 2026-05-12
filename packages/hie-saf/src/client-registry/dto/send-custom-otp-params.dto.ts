import { IsNotEmpty, IsString } from 'class-validator';

export class SendCustomOtpParamsDto {
  @IsNotEmpty()
  @IsString()
  identificationNumber!: string;

  @IsNotEmpty()
  @IsString()
  identificationType!: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber!: string;

  @IsNotEmpty()
  @IsString()
  facility!: string;
}
