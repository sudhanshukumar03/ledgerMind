import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module.js';
import { AiService } from './src/modules/ai/ai.service.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const aiService = app.get(AiService);
  try {
    const res = await aiService.investigateException('EXC-20260905050704-011', 'm_1');
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  }
  await app.close();
}
bootstrap();
