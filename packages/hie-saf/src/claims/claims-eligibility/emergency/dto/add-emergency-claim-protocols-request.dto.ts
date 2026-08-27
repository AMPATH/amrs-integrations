import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class AddEmergencyClaimProtocolsRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  protocolCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  interventionCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  unitPrice!: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  quantity!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
