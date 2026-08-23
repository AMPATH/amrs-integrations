import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { ShrFlag } from '../types';

/**
 * Close an SHR visit. The body beyond `locationUuid` is optional in full:
 * omitting it keeps the default behaviour, where DHA sends a closure OTP and
 * the visit stays open until that password is verified.
 *
 * `patientIncapable: 1` closes the visit immediately instead, for a patient who
 * cannot consent to the closure themselves — unconscious or deceased.
 *
 * Polarity warning: this is `patient_incapable`, the *inverse* of
 * `patient_capable` on `RequestShrConsentDto`. `patientIncapable: 1` here and
 * `patientCapable: 0` there both mean "the patient cannot consent".
 *
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 */
export class CloseShrVisitDto {
  @ApiProperty({
    required: false,
    enum: [ShrFlag.No, ShrFlag.Yes],
    description:
      '1 when the patient cannot consent to closing the visit. The visit then closes immediately, with no OTP. Requires incapacityReason.',
  })
  @ValidateIf(
    (dto: CloseShrVisitDto) =>
      dto.patientIncapable !== undefined || dto.incapacityReason !== undefined,
  )
  @IsIn([ShrFlag.No, ShrFlag.Yes], {
    message: 'patientIncapable must be 0 or 1',
  })
  patientIncapable?: ShrFlag;

  @ApiProperty({
    required: false,
    description:
      'Why the patient cannot consent to the closure. Required when patientIncapable is 1.',
    example: 'Unconscious',
  })
  @ValidateIf(
    (dto: CloseShrVisitDto) =>
      dto.patientIncapable === ShrFlag.Yes ||
      dto.incapacityReason !== undefined,
  )
  @IsNotEmpty({
    message: 'incapacityReason is required when patientIncapable is 1',
  })
  @IsString()
  incapacityReason?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
