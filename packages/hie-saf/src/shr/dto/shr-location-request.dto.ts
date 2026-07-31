import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body/query for the SHR routes whose only client input is the location the
 * facility headers are resolved from — consent status, resend OTP, refresh
 * consent and close visit. Every other value is a path param.
 */
export class ShrLocationRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
