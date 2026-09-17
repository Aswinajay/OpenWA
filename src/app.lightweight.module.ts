import { Module, DynamicModule, Type } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { SessionModule } from './modules/session/session.module';
import { MessageModule } from './modules/message/message.module';
import { TemplateModule } from './modules/template/template.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { EngineModule } from './engine/engine.module';
import { LoggerModule } from './common/services/logger.module';
import { SettingsModule } from './modules/settings/settings.module';
import { EventsModule } from './modules/events/events.module';
import { ContactModule } from './modules/contact/contact.module';
import { GroupModule } from './modules/group/group.module';
import { ProfileModule } from './modules/profile/profile.module';
import { CallModule } from './modules/call/call.module';
import { CacheModule } from './common/cache';
import { StorageModule } from './common/storage/storage.module';
import { HooksModule } from './core/hooks';
import { PluginsModule } from './core/plugins';
import { SqlitePermissionsBoot } from './database/sqlite-file-permissions';

// Keep the lightweight profile deliberately boring: one Node process, SQLite, one WhatsApp-web.js
// engine, no Redis/queue/search/MCP and no optional admin/analytics/media feature modules.
const serveStaticModules: Array<Type | DynamicModule> = [];
export const DASHBOARD_DIST = path.resolve(__dirname, '..', 'dashboard', 'dist');
export const dashboardServingEnabled = process.env.SERVE_DASHBOARD !== 'false';
export const dashboardBuildPresent = fs.existsSync(path.join(DASHBOARD_DIST, 'index.html'));

if (dashboardServingEnabled && dashboardBuildPresent) {
  serveStaticModules.push(
    ServeStaticModule.forRoot({
      rootPath: DASHBOARD_DIST,
      exclude: ['/api/{*splat}', '/socket.io/{*splat}', '/mcp', '/mcp/{*splat}'],
      renderPath: '/__openwa_spa_fallback_owned_by_main_ts__',
    }),
  );
}

const mainDatabase = TypeOrmModule.forRootAsync({
  name: 'main',
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const synchronize = configService.get<boolean>('database.synchronize', true);
    return {
      name: 'main',
      type: 'better-sqlite3' as const,
      database: configService.get<string>('database.database', './data/main.sqlite'),
      entities: [__dirname + '/modules/auth/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/database/migrations-main/*{.ts,.js}'],
      synchronize,
      migrationsRun: !synchronize,
      logging: configService.get<boolean>('database.logging', false),
    };
  },
});

const dataDatabase = TypeOrmModule.forRootAsync({
  name: 'data',
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const synchronize = configService.get<boolean>('dataDatabase.synchronize', true);
    return {
      name: 'data',
      type: 'better-sqlite3' as const,
      database: configService.get<string>('dataDatabase.database', './data/openwa.sqlite'),
      entities: [
        __dirname + '/modules/session/**/*.entity{.ts,.js}',
        __dirname + '/modules/webhook/**/*.entity{.ts,.js}',
        __dirname + '/modules/message/**/*.entity{.ts,.js}',
        __dirname + '/modules/template/**/*.entity{.ts,.js}',
        __dirname + '/engine/**/*.entity{.ts,.js}',
        __dirname + '/modules/integration/**/*.entity{.ts,.js}',
        __dirname + '/modules/status-store/**/*.entity{.ts,.js}',
      ],
      migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
      synchronize,
      migrationsRun: !synchronize,
      logging: configService.get<boolean>('dataDatabase.logging', false),
    };
  },
});

const throttler = ThrottlerModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    throttlers: [
      {
        name: 'short',
        ttl: configService.get<number>('api.rateLimit.shortTtl', 1000),
        limit: configService.get<number>('api.rateLimit.shortLimit', 10),
      },
      {
        name: 'medium',
        ttl: configService.get<number>('api.rateLimit.mediumTtl', 60000),
        limit: configService.get<number>('api.rateLimit.mediumLimit', 100),
      },
      {
        name: 'long',
        ttl: configService.get<number>('api.rateLimit.longTtl', 3600000),
        limit: configService.get<number>('api.rateLimit.longLimit', 1000),
      },
    ],
  }),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    mainDatabase,
    dataDatabase,
    throttler,

    // Runtime essentials.
    LoggerModule,
    HooksModule,
    PluginsModule,
    CacheModule,
    StorageModule,
    EventsModule,
    AuthModule,
    EngineModule,
    SessionModule,
    MessageModule,
    TemplateModule,
    WebhookModule,
    HealthModule,
    SettingsModule,
    ContactModule,
    GroupModule,
    ProfileModule,
    CallModule,

    ...serveStaticModules,
  ],
  providers: [SqlitePermissionsBoot],
})
export class LightweightAppModule {}
