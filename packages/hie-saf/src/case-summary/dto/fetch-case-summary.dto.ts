import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Assemble a patient's visit case summary.
 * Omit `visitUuid` for the default behaviour: the patient's current visit, merged with
 * any sibling visit started the same calendar day.
 */
export class FetchCaseSummaryDto {
  @ApiProperty({ description: 'OpenMRS patient uuid' })
  @IsNotEmpty()
  @IsString()
  patientUuid!: string;

  @ApiPropertyOptional({
    description: 'Summarise this visit only; no same-day merging',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  visitUuid?: string;

  @ApiProperty({ description: 'Login location uuid; resolves the facility' })
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
