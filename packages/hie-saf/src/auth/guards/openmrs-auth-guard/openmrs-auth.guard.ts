import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenMRSSessionResponse } from './types';

@Injectable()
export class OpenMrsAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const sessionCookie = request.cookies?.['JSESSIONID'];

    if (!sessionCookie) {
      throw new UnauthorizedException('OpenMRS session cookie is missing.');
    }

    try {
      const baseOpenMrsUrl =
        this.configService.get<string>('AMRS_BASE_URL') ?? '';
      const openMrsSessionUrl = `https://${baseOpenMrsUrl}/openmrs/ws/rest/v1/session`;
      const resp = await fetch(openMrsSessionUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          cookie: `JSESSIONID=${sessionCookie}`,
        },
      });

      const response = (await resp.json()) as unknown as OpenMRSSessionResponse;
      if (response && response.authenticated === true) {
        return true;
      }

      throw new UnauthorizedException('Invalid OpenMRS session.');
    } catch (error) {
      Logger.error(error);
      throw new UnauthorizedException('OpenMRS authentication failed.');
    }
  }
}
