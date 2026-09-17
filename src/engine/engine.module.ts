import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EngineFactory } from './engine.factory';
import { BaileysStoredMessage } from './adapters/baileys-stored-message.entity';
import { BaileysMessageStoreService } from './adapters/baileys-message-store.service';
import { LidMapping } from './identity/lid-mapping.entity';
import { LidMappingStoreService } from './identity/lid-mapping-store.service';
import { ChatState } from './adapters/baileys-chat-state.entity';
import { ChatStateStoreService } from './adapters/baileys-chat-state-store.service';
import { EngineRegistry } from './engine-registry.service';

const baileysRuntimeEnabled = process.env.LIGHTWEIGHT_MODE !== 'true' || process.env.ENGINE_TYPE === 'baileys';
const engineEntities = [LidMapping, ...(baileysRuntimeEnabled ? [BaileysStoredMessage, ChatState] : [])];
const engineProviders = [
  EngineFactory,
  LidMappingStoreService,
  EngineRegistry,
  ...(baileysRuntimeEnabled ? [BaileysMessageStoreService, ChatStateStoreService] : []),
];

@Global()
@Module({
  imports: [TypeOrmModule.forFeature(engineEntities, 'data')],
  providers: engineProviders,
  exports: [EngineFactory, LidMappingStoreService, EngineRegistry],
})
export class EngineModule {}
