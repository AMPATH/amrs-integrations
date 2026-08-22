import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEmergencyIdentifiedClaimRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  interventionCodes!: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  modeOfArrival!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  broughtBy!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  referenceNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  beneficiaryCrId!: string;

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
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  notes!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
