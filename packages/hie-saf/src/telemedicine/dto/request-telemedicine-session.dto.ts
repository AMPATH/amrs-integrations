import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * Mint a partner telemedicine SSO session for the logged-in practitioner at the
 * caller's facility.
 *
 * The `nationalId` is the **practitioner's** — the session Livia mints belongs
 * to the health worker (read off their OpenMRS provider attributes by the
 * workflow app), and patient selection happens inside the telemedicine app.
 * The `locationUuid` resolves the facility the request is scoped to, which is
 * what picks the `facility_code` Livia needs.
 */
export class RequestTelemedicineSessionDto {
  @ApiProperty({
    description:
      'National ID of the practitioner the telemedicine session is minted for',
  })
  @IsNotEmpty()
  @IsString()
  nationalId!: string;

  @ApiProperty({
    description:
      'OpenMRS location UUID of the facility requesting the session — ' +
      'resolves the facility code sent to the partner',
  })
  @IsUUID()
  locationUuid!: string;
}
