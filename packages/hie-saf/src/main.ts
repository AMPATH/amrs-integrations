import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = 3000;
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap();
