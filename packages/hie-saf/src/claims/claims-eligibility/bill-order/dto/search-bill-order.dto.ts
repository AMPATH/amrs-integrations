import { IsNotEmpty, IsString } from 'class-validator';
export class SearchBillOrderDto {
  @IsNotEmpty()
  @IsString()
  bill_uuid?: string;

  @IsNotEmpty()
  @IsString()
  order_no?: string;
}
