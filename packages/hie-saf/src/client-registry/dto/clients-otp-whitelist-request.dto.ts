import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ClientsOtpWhiteListRequestDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  beneficiaryCrId!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  guid?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
