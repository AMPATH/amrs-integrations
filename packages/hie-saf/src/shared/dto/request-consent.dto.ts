import { IsNotEmpty, IsString } from 'class-validator';
import { ConsentScope } from '../../client-registry/types';

export class RequestConsentDto {
  @IsNotEmpty()
  @IsString()
  identifierType!: string;

  @IsNotEmpty()
  @IsString()
  identifierNumber!: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @IsNotEmpty()
  @IsString()
  scope!: ConsentScope[];
}
