import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Multipart body for POST /pre-auth/normal — mirrors HIE POST /api/v1/preauths.
 * Field names are snake_case (same as the HIE curl). JSON array fields arrive as strings.
 * File parts use field names like attachments_0_file_blob (AnyFilesInterceptor).
 */
export class CreateNormalPreAuthRequestDto {
  @ApiProperty({ description: 'HIE consent / claim token' })
  @IsNotEmpty()
  @IsString()
  consent_token!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  intervention_code!: string;

  @ApiProperty({ example: '2026-03-05T15:30:00+03:00' })
  @IsNotEmpty()
  @IsString()
  service_start!: string;

  @ApiProperty({ example: '2026-03-05T16:00:00+03:00' })
  @IsNotEmpty()
  @IsString()
  service_end!: string;

  /** JSON string: [{"unit_price":"500.00"}] */
  @ApiProperty()
  @IsNotEmpty()
  items!: string;

  /** JSON string: [{"consent_token":"","icd_code":"ca07.0"}] */
  @ApiProperty()
  @IsNotEmpty()
  diagnoses!: string;

  /** JSON string: doctors[] */
  @ApiProperty()
  @IsNotEmpty()
  doctors!: string;

  /** JSON string: [{"document_title":"...","document_type":"LAB_TESTS","file_field_name":"attachments_0_file_blob"}] */
  @ApiProperty()
  @IsNotEmpty()
  attachments!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  provider_notification_email!: string;

  /** Facility location for hie-saf outbound auth (not forwarded to HIE) */
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  // Optional specialty fields (forwarded to HIE when present)
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clinical_indications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carcinoma_staging?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comorbidity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metastases?: string;

  @ApiPropertyOptional()
  @IsOptional()
  treatment_setting?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  number_of_sessions_required?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cost_per_session?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  is_co_insured?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  necessity_of_service?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lens_prescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lens_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eye_examination_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  frame_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  new_or_replacement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  frequency_of_sessions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  start_date?: string;

  // Surgical (HIE camelCase)
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vitalSigns?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  historyOfPresentIllness?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  physicalExamination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  investigationReportDetails?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  typeOfAnaesthesia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  surgeryDate?: string;

  // legacy snake_case aliases
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chief_complaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vital_signs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  history_of_present_illness?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  physical_examination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  investigation_report_details?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type_of_anaesthesia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  surgery_date?: string;
}
