import { IsNotEmpty, IsString } from 'class-validator';

export class FetchFacilityDto {
  @IsNotEmpty()
  @IsString()
  'identifier-type'!: string;

  @IsNotEmpty()
  @IsString()
  identifier!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
