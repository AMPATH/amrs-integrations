import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FacilityClaimVisitRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  visitDate!: string;
}
