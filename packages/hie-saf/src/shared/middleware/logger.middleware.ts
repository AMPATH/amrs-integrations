import { Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
  const { ip, method, url } = req;
  const userAgent = req.get('user-agent') || '';

  res.on('close', () => {
    const { statusCode } = res;
    const contentLength = res.get('content-length');

    Logger.log(
      `${method} ${url} ${statusCode} ${contentLength} - ${userAgent} ${ip}`,
    );
  });
  next();
}
