import { IsNotEmpty, IsString } from 'class-validator';

export class ClientEligibilityParamsDto {
  @IsNotEmpty()
  @IsString()
  requestIdNumber!: string;

  @IsNotEmpty()
  @IsString()
  requestIdType!: string;
}
