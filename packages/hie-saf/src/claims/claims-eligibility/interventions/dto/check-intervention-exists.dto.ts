import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CheckInterventionExistsRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  interventionCode!: string;
}
