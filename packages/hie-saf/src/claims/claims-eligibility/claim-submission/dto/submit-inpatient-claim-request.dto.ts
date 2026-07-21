import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitInpatientClaimRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  invoiceNumber!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  otp?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  dischargeAuthGuid?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  dischargeReason!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  dischargeDate!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  notes!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
