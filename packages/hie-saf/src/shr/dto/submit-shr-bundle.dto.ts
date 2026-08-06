import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * FHIR collection Bundle envelope for POST /shr/bundles. Only the envelope is
 * checked here, matching DHA's own middleware — it only checks
 * `resourceType === "Bundle"` and lets its FHIR validation handle the entry
 * contents. `id` is required too: DHA rejects a Bundle without one
 * ("Bundle.id is required in the payload when resourceType is Bundle"),
 * confirmed against UAT.
 * @see https://hie-docs.dha.go.ke/sharedhealthrecord/shr-records
 */
export class SubmitShrBundleDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  id!: string;

  @ApiProperty({ enum: ['Bundle'] })
  @IsIn(['Bundle'])
  resourceType!: 'Bundle';

  @ApiProperty({ enum: ['collection'] })
  @IsIn(['collection'])
  type!: 'collection';

  @ApiProperty({ description: 'FHIR Bundle entries', type: [Object] })
  @IsArray()
  entry!: Record<string, any>[];
}
