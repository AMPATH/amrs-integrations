import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { logger } from './shared/middleware/logger.middleware';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = 3000;
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe());
  app.use(logger);
  const config = new DocumentBuilder()
    .setTitle('HIE Safaricom Integration')
    .setDescription('Health Information Exchange')
    .setVersion('1.0')
    .addTag('hie')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap();
