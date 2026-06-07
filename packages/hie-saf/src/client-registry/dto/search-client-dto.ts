import { IsNotEmpty, IsString } from 'class-validator';

export class SearchClientDto {
  @IsNotEmpty()
  @IsString()
  identificationType!: string;

  @IsNotEmpty()
  @IsString()
  identificationNumber!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
