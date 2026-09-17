import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { SessionService } from './session.service';
import { SessionAuthDirMigration } from './session-auth-dir-migration.service';
import { SessionEngineLifecycle } from './session-engine-lifecycle.service';
import { SessionLidResolver } from './session-lid-resolver.service';
import { SessionLivenessWatchdog } from './session-liveness-watchdog.service';
import { SessionOwnershipService } from './session-ownership.service';
import { SessionProxyInterceptor } from './session-proxy.interceptor';
import { MessageProjector } from './message-projector.service';
import { SessionErrorStore } from './session-error-store.service';
import { SessionRestrictionStore } from './session-restriction-store.service';
import { PresenceStore } from './presence-store.service';
import { SessionController } from './session.controller';
import { WebhookModule } from '../webhook/webhook.module';
import { StatusStoreModule } from '../status-store/status-store.module';
import { ChatMediaModule } from '../chat-media/chat-media.module';
import { AutomationModule } from '../automation/automation.module';
import { PLUGIN_SESSION_PORT } from '../../core/plugins/plugin-host-ports';

const optionalSessionModules =
  process.env.LIGHTWEIGHT_MODE === 'true' ? [] : [ChatMediaModule, AutomationModule];

@Module({
  // Chat media archiving and automation are optional side effects. MessageProjector injects both
  // services with @Optional(), so lightweight mode can omit their modules without changing the core
  // session lifecycle or message persistence path.
  imports: [
    TypeOrmModule.forFeature([Session, Message], 'data'),
    WebhookModule,
    StatusStoreModule,
    ...optionalSessionModules,
  ],
  controllers: [SessionController],
  providers: [
    // Global on purpose: any controller may carry a session dimension. Inert unless NODE_URL is set.
    { provide: APP_INTERCEPTOR, useClass: SessionProxyInterceptor },
    SessionService,
    SessionAuthDirMigration,
    SessionEngineLifecycle,
    SessionErrorStore,
    SessionRestrictionStore,
    PresenceStore,
    SessionLidResolver,
    SessionLivenessWatchdog,
    SessionOwnershipService,
    MessageProjector,
    { provide: PLUGIN_SESSION_PORT, useExisting: SessionService },
  ],
  exports: [SessionService, MessageProjector, SessionOwnershipService],
})
export class SessionModule {}
