import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageService } from './message.service';
import { MessageSendService } from './message-send.service';
import { BulkMessageService } from './bulk-message.service';
import { MessageTypeBackfillService } from './message-type-backfill.service';
import { PendingMessageReaperService } from './pending-message-reaper.service';
import { MessageController } from './message.controller';
import { SessionModule } from '../session/session.module';
import { TemplateModule } from '../template/template.module';
import { ChatMediaModule } from '../chat-media/chat-media.module';
import { Message } from './entities/message.entity';
import { Session } from '../session/entities/session.entity';
import { SendPacingService } from './send-pacing.service';
import { MessageBatch } from './entities/message-batch.entity';
import { PLUGIN_MESSAGE_PORT } from '../../core/plugins/plugin-host-ports';

const optionalMessageModules = process.env.LIGHTWEIGHT_MODE === 'true' ? [] : [ChatMediaModule];

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, MessageBatch, Session], 'data'),
    SessionModule,
    TemplateModule,
    ...optionalMessageModules,
  ],
  controllers: [MessageController],
  providers: [
    MessageService,
    MessageSendService,
    BulkMessageService,
    MessageTypeBackfillService,
    PendingMessageReaperService,
    SendPacingService,
    { provide: PLUGIN_MESSAGE_PORT, useExisting: MessageService },
  ],
  exports: [MessageService, BulkMessageService, SendPacingService],
})
export class MessageModule {}
