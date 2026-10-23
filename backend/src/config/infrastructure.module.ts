import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from '../common/throttler/redis-throttler-storage.js';

// Factories run after ConfigService has loaded/validated the environment.
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: RedisThrottlerStorage,
      inject: [ConfigService],
      useFactory: (_config: ConfigService) => new RedisThrottlerStorage(),
    },
  ],
  exports: [RedisThrottlerStorage],
})
export class InfrastructureModule {}
