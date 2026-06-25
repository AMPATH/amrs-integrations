import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
export class CreateBillOrderDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  bill_uuid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  order_no!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  line_item_uuid!: string;
}
