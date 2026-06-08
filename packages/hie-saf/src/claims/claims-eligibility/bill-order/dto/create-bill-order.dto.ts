import { IsNotEmpty, IsString } from 'class-validator';
export class CreateBillOrderDto {
  @IsNotEmpty()
  @IsString()
  bill_uuid!: string;

  @IsNotEmpty()
  @IsString()
  order_no!: string;

  @IsNotEmpty()
  @IsString()
  line_item_uuid!: string;
}
