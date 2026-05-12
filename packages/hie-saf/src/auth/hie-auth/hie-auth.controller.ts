import { Controller, Get } from '@nestjs/common';
import { HieAuthService } from './hie-auth.service';

@Controller()
export class HieAuthController {
  constructor(private readonly hieAuthService: HieAuthService) {}

  @Get('hie-auth')
  getToken(): Promise<string> {
    return this.hieAuthService.getToken();
  }
}
