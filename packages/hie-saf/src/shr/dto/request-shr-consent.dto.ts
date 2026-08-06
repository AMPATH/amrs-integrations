import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ShrVisitType } from '../types';

/**
 * Request a patient's consent for an SHR visit.
 * `facility_id` is resolved server side from `locationUuid`.
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 */
export class RequestShrConsentDto {
  @ApiProperty({ description: 'Client Registry identifier of the patient' })
  @IsNotEmpty()
  @IsString()
  crId!: string;

  @ApiProperty({ description: 'Name or role of the requesting health worker' })
  @IsNotEmpty()
  @IsString()
  requestedBy!: string;

  @ApiProperty({ enum: ShrVisitType, example: ShrVisitType.OutPatient })
  @IsNotEmpty()
  @IsEnum(ShrVisitType)
  visitType!: ShrVisitType;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
