import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PayerRemittanceDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  claimGuid?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
