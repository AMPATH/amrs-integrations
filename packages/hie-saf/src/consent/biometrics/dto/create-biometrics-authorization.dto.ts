import { IsArray, IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CreateBiometricsAuthorizationDto {
  @IsNotEmpty()
  @IsString()
  agentId!: string;

  @IsNotEmpty()
  @IsString()
  authorizingDeviceOs!: string;

  @IsNotEmpty()
  @IsArray()
  factors!: string[];

  @IsNotEmpty()
  @IsArray()
  interventions!: string[];

  @IsNotEmpty()
  @IsBoolean()
  isBiometricsDischargeAuthorization!: boolean;

  @IsNotEmpty()
  @IsBoolean()
  isEmergency!: boolean;

  @IsNotEmpty()
  @IsBoolean()
  isIntegration!: boolean;

  @IsNotEmpty()
  @IsString()
  patientId!: string;

  @IsNotEmpty()
  @IsString()
  serviceType!: string;

  @IsNotEmpty()
  @IsString()
  workStationId!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
