import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GetEmergencyClaimProtocolsRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  active!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  interventionCode!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
