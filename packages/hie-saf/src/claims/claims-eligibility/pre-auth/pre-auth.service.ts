import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HieHttpRequests } from '../../../hie-http-request/hie-http-requests';
import { CreateNormalPreAuthRequestDto } from './dto/create-normal-pre-auth.request.dto';
import { ResendDoctorConsentDto } from './dto/resend-doctor-consent.dto';
import { PreAuthPreviewDto, type UploadedPreauthFile } from './types';

/** Optional specialty fields forwarded to HIE when present on the multipart body. */
const SPECIALTY_FORWARD_FIELDS: Array<keyof CreateNormalPreAuthRequestDto> = [
  'clinical_indications',
  'carcinoma_staging',
  'comorbidity',
  'metastases',
  'treatment_setting',
  'number_of_sessions_required',
  'cost_per_session',
  'is_co_insured',
  'necessity_of_service',
  'lens_prescription',
  'lens_amount',
  'eye_examination_amount',
  'frame_amount',
  'new_or_replacement',
  'frequency_of_sessions',
  'start_date',
];

/** Surgical fields — accept camelCase or snake_case from clients; forward snake_case to HIE. */
const SURGICAL_HIE_FIELDS: Array<{
  hieKey: string;
  camel: keyof CreateNormalPreAuthRequestDto;
  snake: keyof CreateNormalPreAuthRequestDto;
}> = [
  { hieKey: 'chief_complaint', camel: 'chiefComplaint', snake: 'chief_complaint' },
  { hieKey: 'vital_signs', camel: 'vitalSigns', snake: 'vital_signs' },
  {
    hieKey: 'history_of_present_illness',
    camel: 'historyOfPresentIllness',
    snake: 'history_of_present_illness',
  },
  {
    hieKey: 'physical_examination',
    camel: 'physicalExamination',
    snake: 'physical_examination',
  },
  {
    hieKey: 'investigation_report_details',
    camel: 'investigationReportDetails',
    snake: 'investigation_report_details',
  },
  { hieKey: 'type_of_anaesthesia', camel: 'typeOfAnaesthesia', snake: 'type_of_anaesthesia' },
  { hieKey: 'surgery_date', camel: 'surgeryDate', snake: 'surgery_date' },
];

type AttachmentMeta = {
  document_title?: string;
  document_type?: string;
  file_field_name?: string;
  documentTitle?: string;
  documentType?: string;
  fileFieldName?: string;
};

const attachmentFieldName = (index: number) => `attachments_${index}_file_blob`;

const parseAttachmentIndex = (fieldName?: string): number | null => {
  if (!fieldName) return null;
  const match = /^attachments_(\d+)_file_blob$/.exec(fieldName.trim());
  return match ? Number(match[1]) : null;
};

@Injectable()
export class PreAuthService {
  constructor(
    private readonly hieHttpRequests: HieHttpRequests,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Accept HIE-shaped multipart and forward to POST /api/v1/preauths.
   * Re-indexes files to contiguous attachments_0_file_blob … attachments_n_file_blob
   * so metadata.file_field_name always matches the file part index.
   */
  async createNormalPreauth(
    dto: CreateNormalPreAuthRequestDto,
    locationUuid: string,
    files: UploadedPreauthFile[],
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const createPreAuthUrl = `${baseUrl}/api/v1/preauths`;
    const externalFormData = new FormData();

    try {
      const { normalizedMeta, orderedFiles } = this.normalizeIndexedAttachments(
        dto.attachments,
        files ?? [],
      );

      externalFormData.append('consent_token', dto.consent_token);
      externalFormData.append('intervention_code', dto.intervention_code);
      externalFormData.append('service_start', dto.service_start);
      externalFormData.append('service_end', dto.service_end);
      externalFormData.append('items', this.asJsonString(dto.items));
      externalFormData.append('diagnoses', this.asJsonString(dto.diagnoses));
      externalFormData.append('doctors', this.asJsonString(dto.doctors));
      externalFormData.append('attachments', JSON.stringify(normalizedMeta));
      externalFormData.append(
        'provider_notification_email',
        dto.provider_notification_email,
      );

      for (const key of SPECIALTY_FORWARD_FIELDS) {
        const value = dto[key];
        if (value != null && value !== '') {
          externalFormData.append(String(key), String(value));
        }
      }

      for (const field of SURGICAL_HIE_FIELDS) {
        const raw = dto[field.camel] ?? dto[field.snake];
        const value = raw == null ? '' : String(raw).trim();
        if (!value) continue;
        externalFormData.append(field.hieKey, value);
      }

      orderedFiles.forEach((file, index) => {
        const fieldName = attachmentFieldName(index);
        // Copy into Uint8Array so Blob accepts the buffer under stricter TS lib types
        const blob = new Blob([Uint8Array.from(file.buffer)], {
          type: file.mimetype || 'application/octet-stream',
        });
        externalFormData.append(
          fieldName,
          blob,
          file.originalname || `${fieldName}.bin`,
        );
      });
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to build HIE preauth form data: ${error.message}`,
      );
    }

    try {
      const response = await this.hieHttpRequests.sendFormDataPostRequest(
        createPreAuthUrl,
        externalFormData,
        locationUuid,
      );
      const data = await response.json();
      if (data && typeof data === 'object' && 'error' in data) {
        Logger.error(data);
        return data;
      }
      return data ?? [];
    } catch (error) {
      Logger.error(error);
      throw new HttpException(
        'Error creating normal preauth',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Resend doctor approval SMS for a preauth stuck in PENDING_DOCTOR_APPROVAL.
   * @see https://hie-docs.dha.go.ke/eclaims/preauth-doctor-consent
   */
  async resendDoctorConsent(dto: ResendDoctorConsentDto) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const url = `${baseUrl}/api/v1/claims/doctor-consent`;
    const payload = {
      practitioner_registration_number: dto.practitioner_registration_number,
      request_type: dto.request_type,
      consent_token: dto.consent_token,
      intervention_code: dto.intervention_code,
    };

    try {
      const response = await this.hieHttpRequests.sendPostRequest(
        url,
        payload,
        dto.locationUuid,
      );
      const text = await response.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        Logger.error(
          `HIE doctor-consent ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
        );
        throw new HttpException(
          typeof data === 'object' && data && 'message' in data
            ? (data as { message: string }).message
            : `HIE doctor-consent failed (${response.status})`,
          response.status >= 400 && response.status < 600
            ? response.status
            : HttpStatus.BAD_GATEWAY,
        );
      }
      return data ?? { status: 'success' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(error);
      throw new HttpException(
        `Error resending doctor consent: ${(error as Error)?.message ?? error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getPreAuthPreview(
    preAuthPreviewDto: PreAuthPreviewDto,
    locationUuid: string,
  ) {
    const baseUrl = this.configService.get<string>('HIE_CLIAMS_BASE_URL') ?? '';
    const token = encodeURIComponent(preAuthPreviewDto.consent_token ?? '');
    const preAuthPreviewUrl = `${baseUrl}/api/v1/preauths?consent_token=${token}`;

    try {
      const response = await this.hieHttpRequests.sendGetRequest(
        preAuthPreviewUrl,
        locationUuid,
      );
      const text = await response.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!response.ok) {
        // No preauth yet for this consent token is a normal empty state
        if (response.status === 404) {
          return null;
        }
        Logger.error(
          `HIE preauth preview ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
        );
        throw new HttpException(
          typeof data === 'object' && data && 'message' in data
            ? (data as { message: string }).message
            : `HIE preauth preview failed (${response.status})`,
          response.status >= 400 && response.status < 600
            ? response.status
            : HttpStatus.BAD_GATEWAY,
        );
      }
      return data ?? null;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      Logger.error(error);
      throw new HttpException(
        `Error getting pre auth preview: ${(error as Error)?.message ?? error}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Map multer files to attachment metadata by index / file_field_name, then
   * re-number to 0..n-1 so HIE always receives contiguous indexes.
   */
  private normalizeIndexedAttachments(
    attachmentsRaw: string | unknown,
    files: UploadedPreauthFile[],
  ): {
    normalizedMeta: Array<{
      document_title: string;
      document_type: string;
      file_field_name: string;
    }>;
    orderedFiles: UploadedPreauthFile[];
  } {
    const metaList = this.parseAttachmentsMeta(attachmentsRaw);
    const filesByField = new Map<string, UploadedPreauthFile>();
    for (const file of files) {
      if (!file?.buffer) continue;
      if (file.fieldname) {
        filesByField.set(file.fieldname, file);
      }
    }

    type Pair = {
      title: string;
      type: string;
      preferredIndex: number;
      file: UploadedPreauthFile;
    };

    const pairs: Pair[] = [];

    metaList.forEach((meta, arrayIndex) => {
      const title = String(meta.document_title ?? meta.documentTitle ?? '').trim();
      const type = String(meta.document_type ?? meta.documentType ?? '').trim();
      const declared =
        meta.file_field_name ??
        meta.fileFieldName ??
        attachmentFieldName(arrayIndex);
      const preferredIndex =
        parseAttachmentIndex(declared) ?? arrayIndex;
      const file =
        filesByField.get(declared) ??
        filesByField.get(attachmentFieldName(preferredIndex)) ??
        filesByField.get(attachmentFieldName(arrayIndex));

      if (!title || !type) {
        throw new BadRequestException(
          `Attachment at index ${arrayIndex} is missing document_title or document_type`,
        );
      }
      if (!file) {
        throw new BadRequestException(
          `Missing file for attachment index ${preferredIndex} (expected field ${attachmentFieldName(preferredIndex)} or ${declared})`,
        );
      }

      pairs.push({ title, type, preferredIndex, file });
      filesByField.delete(file.fieldname);
    });

    // Every uploaded file must map to an attachments[] row
    for (const [fieldName] of filesByField.entries()) {
      if (parseAttachmentIndex(fieldName) == null) {
        throw new BadRequestException(
          `Unexpected file field "${fieldName}". Use attachments_N_file_blob.`,
        );
      }
      throw new BadRequestException(
        `File field "${fieldName}" has no matching attachments[] entry with file_field_name.`,
      );
    }

    pairs.sort((a, b) => a.preferredIndex - b.preferredIndex);

    const normalizedMeta = pairs.map((pair, index) => ({
      document_title: pair.title,
      document_type: pair.type,
      file_field_name: attachmentFieldName(index),
    }));
    const orderedFiles = pairs.map((pair) => pair.file);

    return { normalizedMeta, orderedFiles };
  }

  private parseAttachmentsMeta(raw: string | unknown): AttachmentMeta[] {
    if (raw == null || raw === '') {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw as AttachmentMeta[];
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as AttachmentMeta[]) : [];
      } catch {
        throw new BadRequestException('attachments must be a JSON array string');
      }
    }
    return [];
  }

  private asJsonString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value ?? []);
  }
}
