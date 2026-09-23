import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type { SubmissionFamilySelection } from '../types';

/**
 * Submit one closed AMRS visit to the national Shared Health Record, as a FHIR
 * collection bundle that satisfies the SHA FHIR IG
 * (`docs/shr-visit-submission.md`).
 *
 * The OpenMRS data is read on the caller's own session (the `JSESSIONID` the
 * `OpenMrsAuthGuard` already validated), so the patient/visit permissions are
 * exactly the caller's — no service account is involved.
 */
export class SubmitShrVisitDto {
  @ApiProperty({
    description:
      'OpenMRS patient UUID whose latest closed visit should be submitted',
  })
  @IsUUID()
  patientUuid!: string;

  @ApiProperty({
    description:
      'OpenMRS location UUID of the facility submitting the visit — scopes the ' +
      'visit search, resolves the facility identity (fr-code) for the bundle and ' +
      'the middleware headers, and scopes consent-token resolution',
  })
  @IsUUID()
  locationUuid!: string;

  @ApiProperty({
    required: false,
    description:
      'Submit this specific visit instead of the patient’s latest closed one. ' +
      'Must be closed and must belong to patientUuid.',
  })
  @IsOptional()
  @IsUUID()
  visitUuid?: string;

  @ApiProperty({
    required: false,
    enum: ['auto', 'emergency', 'clinical'],
    description:
      'Which bundle family to build (docs/shr-visit-submission.md §5). ' +
      '"emergency" — the Kenya Emergency Care IG shape (em-* profiles, incident ' +
      'scaffolding, triage acuity). "clinical" — a base-R4 Encounter with the ' +
      'class from the visit type, for routine non-emergency care. ' +
      '"auto" (the default) decides from the AMRS visit type: ' +
      'SHA_VISIT_TYPE_FAMILY_MAP, then SHA_DEFAULT_SUBMISSION_FAMILY.',
  })
  @IsOptional()
  @IsIn(['auto', 'emergency', 'clinical'])
  submissionFamily?: SubmissionFamilySelection;

  @ApiProperty({
    required: false,
    description:
      'Consent token for the SHR write, when the caller already holds it. ' +
      'The X-Consent-Token header takes precedence; otherwise the recorded ' +
      'consent session is consulted (the same resolution as GET /shr/consents/active).',
  })
  @IsOptional()
  @IsString()
  consentToken?: string;

  @ApiProperty({
    required: false,
    description:
      'Build (and pre-validate) the bundle without submitting it — safe against ' +
      'a live SHR. Answers with status "validated" and never touches DHA’s middleware.',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
