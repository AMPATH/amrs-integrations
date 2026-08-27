import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddEmergencyClaimDoctorRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identificationNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identificationType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  regulationBody!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
