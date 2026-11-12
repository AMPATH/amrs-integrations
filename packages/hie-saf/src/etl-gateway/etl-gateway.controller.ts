import {
  All,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { BasicAuthGuard } from '../auth/guards/basic-auth-guard/basic-auth.guard';

interface GatewayRequest extends Request {
  /** JSESSIONID minted by BasicAuthGuard for this caller's credentials. */
  dhaEtlCookie?: string;
  dhaEtlUser?: string;
}

/**
 * DHA gateway facade: accepts `Authorization: Basic`, validates it against
 * OpenMRS (BasicAuthGuard), then proxies GET requests to the cookie-auth ETL
 * with the caller's session cookie attached. The upstream ETL routes stay
 * untouched — the facade is the authorized front door.
 *
 *   GET /etl-gateway                         -> route info (authorized)
 *   GET /etl-gateway/moh-705a?startDate=...   -> proxied 1:1 to the ETL
 *   GET /openmrs/etl style prefixes are configured via ETL_GATEWAY_TARGET.
 */
@Controller('etl-gateway')
@UseGuards(BasicAuthGuard)
export class EtlProxyController {
  private readonly logger = new Logger(EtlProxyController.name);

  constructor(private readonly configService: ConfigService) {}

  private targetBase(): string {
    const target = this.configService.get<string>('ETL_GATEWAY_TARGET');
    return (target || 'http://127.0.0.1:8002').replace(/\/+$/, '');
  }

  private timeoutMs(): number {
    return Number(this.configService.get('ETL_GATEWAY_TIMEOUT_MS')) || 25000;
  }

  @Get()
  info(@Req() request: GatewayRequest) {
    return {
      service: 'dha-etl-gateway',
      auth: 'Authorization: Basic <user>:<password> (validated against OpenMRS)',
      usage:
        'GET /etl-gateway/<etl-route>?<query> — forwarded 1:1 to the cookie-auth ETL with the caller session',
      authenticatedAs: request.dhaEtlUser ?? null,
    };
  }

  @All('{*path}')
  async proxy(
    @Req() request: GatewayRequest,
    @Res() response: Response,
    @Param('path') rawPath: string,
  ) {
    if (request.method !== 'GET') {
      throw new HttpException(
        'Only GET is supported on the DHA gateway',
        HttpStatus.METHOD_NOT_ALLOWED,
      );
    }

    const queryStart = request.originalUrl.indexOf('?');
    const query = queryStart >= 0 ? request.originalUrl.slice(queryStart + 1) : '';
    let upstreamPath: string;
    try {
      upstreamPath = decodeURIComponent(rawPath);
    } catch {
      upstreamPath = rawPath;
    }
    const url = `${this.targetBase()}/${upstreamPath.replace(/^\/+/, '')}${
      query ? `?${query}` : ''
    }`;

    try {
      const upstream = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          cookie: request.dhaEtlCookie ?? '',
        },
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      const contentType =
        upstream.headers.get('content-type') ?? 'application/json';
      const body = await upstream.text();
      response.status(upstream.status).type(contentType).send(body);
    } catch (error) {
      this.logger.warn(`gateway proxy failed for ${url}: ${String(error)}`);
      const timedOut =
        error instanceof Error && /timeout|abort/i.test(error.message);
      response
        .status(timedOut ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY)
        .json({
          statusCode: timedOut ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY,
          error: timedOut ? 'Gateway Timeout' : 'Bad Gateway',
          message: timedOut
            ? 'Upstream ETL did not respond within the gateway timeout.'
            : 'Upstream ETL request failed.',
        });
    }
  }
}
