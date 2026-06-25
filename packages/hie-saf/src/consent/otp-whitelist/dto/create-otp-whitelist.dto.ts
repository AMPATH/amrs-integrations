import { IsNotEmpty, IsString } from 'class-validator';

export class CreateOtpWhitelistRequestDto {
  @IsNotEmpty()
  @IsString()
  reasonType!: string;

  @IsNotEmpty()
  @IsString()
  reason!: string;

  @IsNotEmpty()
  @IsString()
  beneficiaryCrId!: string;

  @IsNotEmpty()
  @IsString()
  attachments!: string;

  attachmentsFileBlob!: any[];

  @IsNotEmpty()
  @IsString()
  biometricAttempts!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
