import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true จำเป็นสำหรับตรวจ x-line-signature ของ LINE webhook
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`เจ้านาย (JaoNine) bot listening on port ${port}`, 'Bootstrap');
}

bootstrap();
