import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  // Enable CORS
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0'); // Port 3001 for API to avoid conflict with Next.js (3000)
}
bootstrap();
