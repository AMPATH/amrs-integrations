import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InterventionsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  sub_benefit_code!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
