import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { EventsGateway } from '../events/events.gateway';
import { WebhookService } from '../webhook/webhook.service';
import { DEFAULT_MEDIA_MAX_BYTES, STATUS_TTL_MS, StatusStoreService } from '../status-store/status-store.service';
import { buildIncomingStatus } from '../status-store/incoming-status';
import { GroupEvent, IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';
import { type createLogger } from '../../common/services/logger.service';

// How many recent status-broadcast messages the connect-time seed pulls (each with its media).
// Fixed ceiling: the most-recent 50 cover a normal account's 24h of stories; anything posted after
// connect still lands live via onMessage. Make it configurable only if a flood account proves 50
// too few.
const STATUS_SEED_LIMIT = 50;

/**
 * The leaf event fan-out extracted from SessionEngineLifecycle: the connect-time status backfill,
 * the group-event fan-out, and the opt-in call auto-reject. Plain class (NOT a NestJS provider —
 * the lifecycle's constructor signature is frozen by specs), built inside the lifecycle's
 * constructor. Zero shared state: every method reads only its deps and arguments, so the method
 * bodies below moved verbatim, which is why they read `this.sessionRepository` /
 * `this.eventsGateway` / `this.webhookService` / `this.configService` / `this.statusStore` /
 * `this.logger` against the same-named fields assigned here. The lifecycle keeps a same-named
 * delegate only for `seedStatuses` — the one method its own core calls (the baileys forwarder
 * precedent) — so that call site stays byte-identical. `dispatchGroupEvent` and
 * `maybeAutoRejectCall` are reached by the event wiring through `host.leafEvents` directly and
 * have no lifecycle delegate.
 */
export class SessionEngineLeafEvents {
  private readonly sessionRepository: Repository<Session>;
  private readonly eventsGateway: EventsGateway;
  private readonly webhookService: WebhookService;
  private readonly configService?: ConfigService;
  private readonly statusStore: StatusStoreService;
  private readonly logger: ReturnType<typeof createLogger>;

  constructor(deps: {
    sessionRepository: Repository<Session>;
    eventsGateway: EventsGateway;
    webhookService: WebhookService;
    configService?: ConfigService;
    statusStore: StatusStoreService;
    logger: ReturnType<typeof createLogger>;
  }) {
    this.sessionRepository = deps.sessionRepository;
    this.eventsGateway = deps.eventsGateway;
    this.webhookService = deps.webhookService;
    this.configService = deps.configService;
    this.statusStore = deps.statusStore;
    this.logger = deps.logger;
  }

  /**
   * Backfill currently-active statuses from the engine on connect, so the store has today's stories
   * even for ones posted before this session came online (live posts land via onMessage). Best-effort:
   * Baileys doesn't support this (throws EngineNotSupportedError) and any other engine error must not
   * take down the ready path, so every failure is swallowed here. Ingest is idempotent on
   * `(sessionId, waStatusId)`, so this can never double-count a status onMessage already ingested.
   */
  async seedStatuses(sessionId: string, engine: IWhatsAppEngine): Promise<void> {
    if (process.env.SEND_ONLY_MODE === 'true') {
      // A send-only gateway has no reason to backfill WhatsApp Status history. This prevents the
      // connect-time `status@broadcast` fetch (and its contact/media work) from loading any history.
      return;
    }

    try {
      const mediaMaxBytes =
        this.configService?.get<number>('status.mediaMaxBytes', DEFAULT_MEDIA_MAX_BYTES) ?? DEFAULT_MEDIA_MAX_BYTES;
      const messages = await engine.getChatHistory('status@broadcast', STATUS_SEED_LIMIT, true, mediaMaxBytes);
      const contactNames = new Map<string, { name?: string; pushName?: string }>();
      const resolvePoster = async (jid: string): Promise<{ name?: string; pushName?: string }> => {
        const cached = contactNames.get(jid);
        if (cached) return cached;
        let resolved: { name?: string; pushName?: string } = {};
        try {
          const contact = await engine.getContactById(jid);
          if (contact) resolved = { name: contact.name, pushName: contact.pushName };
        } catch {
          // Best-effort: a failed lookup just leaves the status nameless.
        }
        contactNames.set(jid, resolved);
        return resolved;
      };
      for (const msg of messages) {
        try {
          if (msg.fromMe) continue;
          if (msg.timestamp * 1000 + STATUS_TTL_MS <= Date.now()) continue;
          const status = buildIncomingStatus(msg);
          if (!status) continue;
          if (!status.contactName && !status.contactPushName) {
            const poster = await resolvePoster(status.contactJid);
            status.contactName = poster.name;
            status.contactPushName = poster.pushName;
          }
          await this.statusStore.ingest(sessionId, status);
        } catch (itemErr) {
          this.logger.warn('Status seed item skipped', {
            sessionId,
            error: itemErr instanceof Error ? itemErr.message : String(itemErr),
          });
        }
      }
    } catch (err) {
      this.logger.debug('Status seed skipped', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  dispatchGroupEvent(id: string, event: GroupEvent): void {
    const payload: Record<string, unknown> = {
      groupId: event.groupId,
      participantIds: event.participantIds,
      timestamp: event.timestamp,
    };
    if (event.actorId !== undefined) {
      payload.actorId = event.actorId;
    }
    if (event.changes !== undefined) {
      payload.changes = event.changes;
    }

    switch (event.kind) {
      case 'join':
        this.eventsGateway.emitGroupJoin(id, payload);
        void this.webhookService.dispatch(id, 'group.join', payload);
        break;
      case 'leave':
        this.eventsGateway.emitGroupLeave(id, payload);
        void this.webhookService.dispatch(id, 'group.leave', payload);
        break;
      case 'update':
        this.eventsGateway.emitGroupUpdate(id, payload);
        void this.webhookService.dispatch(id, 'group.update', payload);
        break;
      case 'join_request':
        this.eventsGateway.emitGroupJoinRequest(id, payload);
        void this.webhookService.dispatch(id, 'group.join_request', payload);
        break;
    }
  }

  async maybeAutoRejectCall(id: string, engine: IWhatsAppEngine, callId: string): Promise<void> {
    let session: Session | null;
    try {
      session = await this.sessionRepository.findOne({ where: { id } });
    } catch (err) {
      this.logger.error('Failed to reload the session for call auto-reject', String(err), {
        sessionId: id,
        action: 'call_auto_reject_error',
      });
      return;
    }
    if (session?.config?.autoRejectCalls !== true) {
      return;
    }
    try {
      await engine.rejectCall(callId);
      this.logger.log('Auto-rejected incoming call', {
        sessionId: id,
        callId,
        action: 'call_auto_rejected',
      });
    } catch (err) {
      this.logger.warn('Failed to auto-reject incoming call', {
        sessionId: id,
        callId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
