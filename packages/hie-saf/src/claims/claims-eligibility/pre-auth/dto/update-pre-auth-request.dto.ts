import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PreAuthRequestStatus } from 'src/claims/types';

export class UpdatePreAuthRequestDto {
  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  status?: PreAuthRequestStatus;
}
