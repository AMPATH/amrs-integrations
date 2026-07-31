import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Security labels DHA supports for a FHIR resource type and/or code.
 * At least one of `resourceName` or `code` is required.
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-records
 */
export class FetchResourceLabelsDto {
  @ApiProperty({ required: false, example: 'Observation' })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  resourceName?: string;

  @ApiProperty({ required: false, example: '8867-4' })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  code?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
