import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateConsentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  otp!: string;
}
