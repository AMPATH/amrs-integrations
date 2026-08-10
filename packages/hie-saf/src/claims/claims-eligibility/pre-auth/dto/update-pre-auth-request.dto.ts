import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PreAuthRequestStatus } from 'src/claims/types';

export class UpdatePreAuthRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  status?: PreAuthRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consentToken?: string;
}
