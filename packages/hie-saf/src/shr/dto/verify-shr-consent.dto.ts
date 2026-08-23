import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ShrConsentDecision } from '../types';

/**
 * Verify an SHR consent with the OTP the patient received. Also the call that
 * records a *refusal*, and the one that completes an OTP-gated visit closure —
 * DHA tells those apart server side from the `otpRecord`, so there is no branch
 * here. The three outcomes differ only in the response.
 *
 * On an approval it returns the `consent_token` used as `X-Consent-Token` when
 * reading records. A refusal is the one path that carries no `otp` — the
 * patient never gave one — so `otp` is required only when not rejecting.
 *
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-consent
 */
export class VerifyShrConsentDto {
  /**
   * Required on every path except a recorded refusal: a patient who declines
   * never hands over a password, so `consentDecision: 'Reject'` is the one case
   * that goes up without an `otp`.
   */
  @ApiProperty({
    required: false,
    description:
      'OTP the patient received. Required unless consentDecision is Reject.',
  })
  @ValidateIf(
    (dto: VerifyShrConsentDto) =>
      dto.consentDecision !== ShrConsentDecision.Reject,
  )
  @IsNotEmpty({
    message: 'otp is required unless the consent is being rejected',
  })
  @IsString()
  otp?: string;

  @ApiProperty({
    description:
      'OTP record reference from the consent request, the latest resend-otp call, or the close-visit call being completed',
  })
  @IsNotEmpty()
  @IsString()
  otpRecord!: string;

  @ApiProperty({
    required: false,
    enum: ShrConsentDecision,
    description:
      "The patient's decision. Treated as an approval by DHA when omitted.",
  })
  @IsOptional()
  @IsEnum(ShrConsentDecision)
  consentDecision?: ShrConsentDecision;

  @ApiProperty({
    required: false,
    description: 'Why the patient refused. Required on a Reject decision.',
    example: 'Patient denied consent',
  })
  @ValidateIf(
    (dto: VerifyShrConsentDto) =>
      dto.consentDecision === ShrConsentDecision.Reject ||
      dto.rejectionReason !== undefined,
  )
  @IsNotEmpty({
    message: 'rejectionReason is required when rejecting a consent',
  })
  @IsString()
  rejectionReason?: string;

  /**
   * Only used locally, never forwarded: an approval issues the token this
   * middleware records against `(crId, locationUuid)`. Optional so existing
   * callers keep working — when it is absent the CR id is recovered from the
   * issued token's `sub` claim, and if that is missing too the consent still
   * succeeds, it just is not tracked for `GET /shr/consents/active`.
   */
  @ApiProperty({
    required: false,
    description:
      'Client Registry identifier of the patient. Not sent to DHA — it keys the consent session recorded on approval.',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  crId?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
