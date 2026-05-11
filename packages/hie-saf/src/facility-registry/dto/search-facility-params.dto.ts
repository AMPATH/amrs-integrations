import { IsNotEmpty, IsString } from 'class-validator';

export class SearchFacilityParamsDto {
  @IsNotEmpty()
  @IsString()
  filterType!: string;

  @IsNotEmpty()
  @IsString()
  filterValue!: string;
}
