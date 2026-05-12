import { IsNotEmpty, IsString } from 'class-validator';

export class SearchHealthWorkerParamsDto {
  @IsNotEmpty()
  @IsString()
  identifierType!: string;

  @IsNotEmpty()
  @IsString()
  identifierValue!: string;
}
