import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';

export class PreauthProviderStateTransitionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subject_guid!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  from_state!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  to_state!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  facility_fr_code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tenant_code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  entity_type!: string;

  @ApiProperty()
  @IsISO8601()
  @IsNotEmpty()
  timestamp!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  consent_token!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  notes!: string;
}
