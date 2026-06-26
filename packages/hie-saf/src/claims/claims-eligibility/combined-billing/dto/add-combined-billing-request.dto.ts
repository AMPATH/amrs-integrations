import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class AddCombinedBillingRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  interventionCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  chargeDate!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  serviceName!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  serviceIdentifier!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  unitPrice!: number;

  @ApiProperty()
  @IsNotEmpty()
  quantity!: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  schemeName!: string;

  @ApiProperty()
  @IsNotEmpty()
  diagnoses!: string[];

  @ApiProperty()
  @IsNotEmpty()
  attachments!: any[];

  @ApiProperty()
  @IsNotEmpty()
  attachments_0_file_blob!: any[];

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
