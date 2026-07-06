import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddClaimDiagnosisRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  interventionCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  practitionerIdentificationNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  practitionerIdentificationType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  practitionerRegulationBody!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  icdCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
