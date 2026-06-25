import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateBiometricsAuthorizationDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  agentId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  authorizingDeviceOs!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  factors!: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  interventions!: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  isBiometricsDischargeAuthorization!: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  isEmergency!: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsBoolean()
  isIntegration!: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patientId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  serviceType!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  workStationId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
