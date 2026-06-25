import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SwitchInterventionsRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  existingInterventionCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  newInterventionCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  retainBillItems!: boolean;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  billFrom!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  billTo!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
