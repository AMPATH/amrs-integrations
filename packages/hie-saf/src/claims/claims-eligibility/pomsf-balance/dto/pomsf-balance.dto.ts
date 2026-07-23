import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PomsfBalanceDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  policyYear!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  principalMemberNumber!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
