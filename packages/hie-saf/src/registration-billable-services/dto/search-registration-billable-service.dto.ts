import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
export class SearchRegistrationBillableServiceDto {
  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  billableServiceName!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
