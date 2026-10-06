import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PomsfCoverageDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  principalCrId!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  policyNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
