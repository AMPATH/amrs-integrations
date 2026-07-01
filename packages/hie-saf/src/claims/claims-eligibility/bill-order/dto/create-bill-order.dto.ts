import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
export class CreateBillOrderDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  bill_uuid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  order_no!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  line_item_uuid!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  intervention_code?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  consent_token?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  service_type?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsBoolean()
  requires_preauth?: boolean;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsBoolean()
  normal_preauth?: boolean;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsBoolean()
  elective_preauth?: boolean;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsBoolean()
  preauth_approved?: boolean;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  required_documents?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  applicable_document_types?: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  required_preauth_document_types?: string;
}
