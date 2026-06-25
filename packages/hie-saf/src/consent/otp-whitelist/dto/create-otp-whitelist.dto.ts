import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateOtpWhitelistRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  reasonType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  reason!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  beneficiaryCrId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  attachments!: string;

  @ApiProperty()
  attachmentsFileBlob!: any[];

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  biometricAttempts!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
