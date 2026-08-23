import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body/query for the SHR routes whose only client input is the location the
 * facility headers are resolved from — consent status, resend OTP and refresh
 * consent. Every other value is a path param. Close visit takes an optional
 * body beyond this, so it has its own `CloseShrVisitDto`.
 */
export class ShrLocationRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
