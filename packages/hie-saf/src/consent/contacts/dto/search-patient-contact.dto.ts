import { IsNotEmpty, IsString } from 'class-validator';

export class SearchPatientContactsDto {
  @IsNotEmpty()
  @IsString()
  crId!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
