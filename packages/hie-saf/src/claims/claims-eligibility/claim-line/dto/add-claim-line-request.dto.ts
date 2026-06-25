import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AddClaimLineRequestDto {
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
  serviceName!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  serviceIdentifier!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  unitPrice!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  quantity!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  schemeCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
