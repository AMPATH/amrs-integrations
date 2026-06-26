import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PreviewPayerClaimRequestDto {
  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  guid?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  providerClaimNo?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
