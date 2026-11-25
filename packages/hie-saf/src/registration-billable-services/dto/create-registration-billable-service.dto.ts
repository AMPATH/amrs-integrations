import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
export class CreateRegistrationBillableServiceDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  billableServiceName!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  billableServiceUuid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
