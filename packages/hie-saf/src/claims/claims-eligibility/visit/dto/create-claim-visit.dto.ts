import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { ServiceType } from '../types';

export class CreateClaimVisitDto {
  @IsNotEmpty()
  @IsArray()
  intervention_codes!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @IsNotEmpty()
  @IsString()
  otp!: string;

  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @IsNotEmpty()
  @IsString()
  service_type!: ServiceType;
}
