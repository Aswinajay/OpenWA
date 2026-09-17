import { type Client, MessageTypes } from 'whatsapp-web.js';
import {
  type IncomingMessage,
  type RevokedMessage,
  type ReactionEvent,
  type EditedMessage,
} from '../interfaces/whatsapp-engine.interface';
import { type SerializedWid } from '../types/whatsapp-web-js.types';
import { buildEditedMessage, buildIncomingMessageBase, mapContactFields } from './message-mapper';
import { extractWwebjsCall, wwebjsAckToDeliveryStatus } from './wwebjs-messaging';
import { type WwebjsEngineHost } from './wwebjs-host';

/**
 * Message-domain client events (message, message_create, ack, revoke, reaction, edit) extracted
 * from the adapter's event wiring. Send-only mode intentionally keeps only delivery acknowledgements:
 * it does not process or persist inbound messages, quoted messages, reactions, edits, revocations, or
 * phone-composed outgoing echoes.
 */
export function registerWwebjsMessageEvents(client: Client, host: WwebjsEngineHost): void {
  if (process.env.SEND_ONLY_MODE === 'true') {
    // Sending still needs message acknowledgements so the persisted outbound row can advance from
    // SENT -> DELIVERED/READ or -> FAILED. Everything else is deliberately not registered: no inbound
    // message mapping, contact lookup, media decryption/download, history-like enrichment, or event
    // projection work on a send-only gateway.
    client.on('message_ack', (msg, ack) => {
      const rawId = msg.id as unknown as SerializedWid | undefined;
      const ackId = rawId?._serialized ?? rawId?.$1;
      if (!ackId) {
        host.logger.warn('Dropping an ack whose message id could not be read', { ack });
        return;
      }
      host.getCallbacks().onMessageAck?.(ackId, wwebjsAckToDeliveryStatus(ack));
    });
    host.logger.log('Send-only mode: inbound message/event processing disabled');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  client.on('message', async msg => {
    try {
      const incomingMessage: IncomingMessage = buildIncomingMessageBase(msg);

      // Attach the sender's contact info. getContact() gives the real sender (author in groups, from
      // in 1:1); we read only its synchronous fields and never the async getters (profile pic, about),
      // which would hit WhatsApp on every message.
      try {
        const contact = await msg.getContact();
        if (contact) {
          const full = process.env.WEBHOOK_CONTACT_DETAILS === 'true';
          const merged = { ...incomingMessage.contact, ...mapContactFields(contact, full) };
          if (Object.keys(merged).length > 0) {
            incomingMessage.contact = merged;
          }
        }
      } catch (error) {
        host.logger.error('Error getting message contact', String(error));
      }

      // Handle location
      if (msg.type === MessageTypes.LOCATION && msg.location) {
        incomingMessage.location = {
          latitude: Number(msg.location.latitude),
          longitude: Number(msg.location.longitude),
          description: msg.location.description || undefined,
          address: msg.location.address || undefined,
          url: msg.location.url || undefined,
        };
      }

      // Handle media
      if (msg.hasMedia) {
        try {
          const capped = await host.capInboundMediaFor(msg);
          if (capped) incomingMessage.media = capped;
        } catch (error) {
          host.logger.error('Error downloading media', String(error));
        }
      }

      // Handle quoted message
      if (msg.hasQuotedMsg) {
        try {
          const quoted = await msg.getQuotedMessage();
          incomingMessage.quotedMessage = {
            id: quoted.id._serialized,
            body: quoted.body,
          };
        } catch (error) {
          host.logger.error('Error getting quoted message', String(error));
        }
      }

      const call = extractWwebjsCall(msg);
      if (call) incomingMessage.call = call;

      host.getCallbacks().onMessage?.(incomingMessage);
    } catch (error) {
      host.logger.error('Error processing incoming message', String(error));
    }
  });

  client.on('message_create', msg => {
    if (!msg.fromMe) {
      return;
    }

    void (async () => {
      const incomingMessage = buildIncomingMessageBase(msg);
      if (msg.hasMedia) {
        try {
          incomingMessage.media = await host.capInboundMediaFor(msg);
        } catch (error) {
          host.logger.warn('Own-send media download failed; emitting echo without media', {
            msgId: msg.id?._serialized,
            error: String(error),
          });
        }
      }
      try {
        host.getCallbacks().onMessageCreate?.(incomingMessage);
      } catch (error) {
        host.logger.error('Error processing outgoing message', String(error));
      }
    })();
  });

  client.on('message_ack', (msg, ack) => {
    const rawId = msg.id as unknown as SerializedWid | undefined;
    const ackId = rawId?._serialized ?? rawId?.$1;
    if (!ackId) {
      host.logger.warn('Dropping an ack whose message id could not be read', { ack });
      return;
    }
    host.getCallbacks().onMessageAck?.(ackId, wwebjsAckToDeliveryStatus(ack));
  });

  client.on('message_revoke_everyone', (after, before) => {
    try {
      const selfWid = host.getSelfWid();
      const afterId = after.id as unknown as SerializedWid | undefined;
      const beforeId = before?.id as unknown as SerializedWid | undefined;
      const payload: RevokedMessage = {
        id: afterId?._serialized ?? afterId?.$1 ?? '',
        revokedId: beforeId?._serialized ?? beforeId?.$1,
        chatId: after.from === selfWid ? after.to : after.from,
        from: after.from,
        to: after.to,
        type: 'revoked',
        body: '',
        timestamp: after.timestamp,
      };
      host.getCallbacks().onMessageRevoked?.(payload);
    } catch (error) {
      host.logger.error('Error processing message_revoke_everyone', String(error));
    }
  });

  client.on('message_reaction', reaction => {
    try {
      const msgId = reaction.msgId as unknown as SerializedWid;
      const event: ReactionEvent = {
        messageId: msgId?._serialized ?? msgId?.$1 ?? '',
        chatId: reaction.id.remote,
        reaction: reaction.reaction,
        senderId: reaction.senderId,
      };
      host.getCallbacks().onMessageReaction?.(event);
    } catch (error) {
      host.logger.error('Error processing message_reaction', String(error));
    }
  });

  client.on('message_edit', (message, newBody) => {
    try {
      const editTimestamp = Math.floor(Date.now() / 1000);
      const base = buildIncomingMessageBase({
        id: message.id,
        from: message.from,
        to: message.to,
        body: String(newBody),
        type: message.type,
        timestamp: editTimestamp,
        fromMe: message.fromMe,
        author: message.author,
        mentionedIds: message.mentionedIds,
      });
      const payload: EditedMessage = buildEditedMessage(base, Boolean(message.hasMedia));
      host.getCallbacks().onMessageEdited?.(payload);
    } catch (error) {
      host.logger.error('Error processing message_edit', String(error));
    }
  });
}
