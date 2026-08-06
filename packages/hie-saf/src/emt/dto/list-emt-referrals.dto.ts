import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * List EMT ambulance referrals pending action at this facility.
 * @see https://hie-docs.dha.go.ke/eclaims/emt-handover
 */
export class ListEmtReferralsDto {
  @ApiProperty({
    required: false,
    description: 'Filter by referral status',
    example: 'pending_acceptance',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  status?: string;

  @ApiProperty({
    required: false,
    description: 'Max results to return',
    example: '50',
  })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiProperty({
    required: false,
    description: 'Pagination offset',
    example: '0',
  })
  @IsOptional()
  @IsNumberString()
  offset?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
