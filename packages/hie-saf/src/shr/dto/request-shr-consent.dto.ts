import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ShrFlag, ShrRepresentativeRelationship, ShrVisitType } from '../types';

/**
 * Request a patient's consent for an SHR visit.
 * `facility_id` is resolved server side from `locationUuid`, and
 * `practitioner_id` from the logged in provider — neither is taken from the
 * client.
 *
 * Three shapes share this DTO:
 *  - **standard** — the four required fields
 *  - **emergency** — `emergency: 1` plus `incapacityReason`; approved on the
 *    spot, so the response carries a token instead of an OTP record
 *  - **dependant** — `representativeCrId` + `representativeRelationship`, for a
 *    minor or an incapacitated adult; the OTP goes to the representative
 *
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

  @ApiProperty({
    required: false,
    enum: [ShrFlag.No, ShrFlag.Yes],
    description:
      '1 for an emergency consent — the patient is incapacitated and consent cannot be collected at the point of care. Approved immediately, with no OTP. incapacityReason is required alongside it.',
  })
  @IsOptional()
  @IsIn([ShrFlag.No, ShrFlag.Yes])
  emergency?: ShrFlag;

  /**
   * Required for an emergency consent, and for a dependant request where the
   * patient is an incapacitated adult. Whether the patient is a minor is not
   * knowable here, so DHA has the final say on that case — the check below only
   * enforces what is unambiguous.
   */
  @ApiProperty({
    required: false,
    description:
      'Why the patient cannot consent for themselves. Required when emergency is 1.',
    example: 'Unconscious on arrival',
  })
  @ValidateIf(
    (dto: RequestShrConsentDto) =>
      dto.emergency === ShrFlag.Yes || dto.incapacityReason !== undefined,
  )
  @IsNotEmpty({
    message: 'incapacityReason is required for an emergency consent',
  })
  @IsString()
  incapacityReason?: string;

  @ApiProperty({
    required: false,
    enum: [ShrFlag.No, ShrFlag.Yes],
    description:
      '0 when the patient cannot consent for themselves. Defaults to 1. Requires representativeCrId. Note the polarity is inverted on close-visit, where patientIncapable: 1 carries the same meaning.',
  })
  @IsOptional()
  @IsIn([ShrFlag.No, ShrFlag.Yes])
  patientCapable?: ShrFlag;

  @ApiProperty({
    required: false,
    description:
      "Client Registry identifier of the principal consenting on the patient's behalf. Routes the consent and its OTP to them.",
  })
  @ValidateIf(
    (dto: RequestShrConsentDto) =>
      dto.patientCapable === ShrFlag.No || dto.representativeCrId !== undefined,
  )
  @IsNotEmpty({
    message: 'representativeCrId is required when patientCapable is 0',
  })
  @IsString()
  representativeCrId?: string;

  @ApiProperty({
    required: false,
    enum: ShrRepresentativeRelationship,
    description:
      'How the representative relates to the patient. Required whenever representativeCrId is provided.',
  })
  @ValidateIf(
    (dto: RequestShrConsentDto) =>
      dto.representativeCrId !== undefined ||
      dto.representativeRelationship !== undefined,
  )
  @IsEnum(ShrRepresentativeRelationship, {
    message:
      'representativeRelationship is required whenever representativeCrId is provided',
  })
  representativeRelationship?: ShrRepresentativeRelationship;

  @ApiProperty({
    required: false,
    description:
      'Date the visit starts, as YYYY-MM-DD. Defaults to the date DHA creates the consent.',
    example: '2026-07-18',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must be a YYYY-MM-DD date',
  })
  startDate?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
