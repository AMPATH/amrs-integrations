import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ClaimAuthorizationsRequestDto {
  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  beneficiaryCode!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
