import { IsNotEmpty, IsString } from 'class-validator';

export class ClientEligibilitySearchDto {
  @IsNotEmpty()
  @IsString()
  identificationType!: string;

  @IsNotEmpty()
  @IsString()
  identificationNumber!: string;
}
