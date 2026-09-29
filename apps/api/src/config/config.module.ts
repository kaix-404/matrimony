import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env';

/**
 * The environment is parsed once, eagerly, so a misconfigured deployment
 * refuses to start rather than failing on the first request that needs the
 * missing value.
 */
@Global()
@Module({
  providers: [
    {
      provide: 'ENV',
      useFactory: (): Env => loadEnv(),
    },
  ],
  exports: ['ENV'],
})
export class ConfigModule {}
