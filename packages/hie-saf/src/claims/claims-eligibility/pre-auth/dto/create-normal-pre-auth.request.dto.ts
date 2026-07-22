import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  PreAuthAttachmentRequest,
  PreAuthDiagnosisRequest,
  PreAuthDoctorRequest,
  PreAuthRequestItem,
} from '../types';

export class CreateNormalPreAuthRequestDto {
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
  serviceStart!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  serviceEnd!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  items!: PreAuthRequestItem[];

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  diagnoses!: PreAuthDiagnosisRequest[];

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  doctors!: PreAuthDoctorRequest[];

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  attachments!: PreAuthAttachmentRequest[];

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  attachments0Fileblob!: any[];

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  providerNotificationEmail!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
