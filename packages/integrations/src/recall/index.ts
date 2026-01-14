// ===========================================
// Recall.ai Integration (Complete Implementation)
// ===========================================

const RECALL_API_KEY = process.env.RECALL_API_KEY ?? '';
const RECALL_API_URL = process.env.RECALL_API_URL ?? 'https://api.recall.ai/api/v1';
const RECALL_WEBHOOK_SECRET = process.env.RECALL_WEBHOOK_SECRET ?? '';

interface CreateBotOptions {
  meeting_url: string;
  bot_name?: string;
  transcription_options?: {
    provider?: string;
  };
  recording_mode?: 'speaker_view' | 'gallery_view' | 'audio_only';
  chat?: {
    on_bot_join?: {
      send_to: 'everyone' | 'host';
      message: string;
    };
  };
  automatic_leave?: {
    waiting_room_timeout?: number;
    noone_joined_timeout?: number;
    everyone_left_timeout?: number;
  };
}

interface Bot {
  id: string;
  meeting_url: string;
  status_changes?: Array<{ code: string; message?: string; created_at: string }>;
  video_url?: string;
  audio_url?: string;
  transcript?: Array<{
    speaker: string;
    words: Array<{ text: string; start: number; end: number }>;
  }>;
}

interface RecallClient {
  createBot(options: CreateBotOptions): Promise<{ id: string }>;
  getBot(botId: string): Promise<Bot>;
  deleteBot(botId: string): Promise<void>;
  sendChatMessage(botId: string, message: string): Promise<void>;
  getTranscript(botId: string): Promise<Array<{
    speaker: string;
    words: Array<{ text: string; start: number; end: number }>;
  }>>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

export function createRecallClient(): RecallClient {
  const headers = {
    'Authorization': `Token ${RECALL_API_KEY}`,
    'Content-Type': 'application/json',
  };

  return {
    async createBot(options: CreateBotOptions): Promise<{ id: string }> {
      const response = await fetch(`${RECALL_API_URL}/bot/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Recall API error: ${error}`);
      }

      return response.json() as Promise<{ id: string }>;
    },

    async getBot(botId: string): Promise<Bot> {
      const response = await fetch(`${RECALL_API_URL}/bot/${botId}/`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Recall API error: ${response.status}`);
      }

      return response.json() as Promise<Bot>;
    },

    async deleteBot(botId: string): Promise<void> {
      const response = await fetch(`${RECALL_API_URL}/bot/${botId}/`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Recall API error: ${response.status}`);
      }
    },

    async sendChatMessage(botId: string, message: string): Promise<void> {
      const response = await fetch(`${RECALL_API_URL}/bot/${botId}/send_chat_message/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`Recall API error: ${response.status}`);
      }
    },

    async getTranscript(botId: string): Promise<Array<{
      speaker: string;
      words: Array<{ text: string; start: number; end: number }>;
    }>> {
      const response = await fetch(`${RECALL_API_URL}/bot/${botId}/transcript/`, {
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        throw new Error(`Recall API error: ${response.status}`);
      }

      return response.json();
    },

    verifyWebhookSignature(payload: string, signature: string): boolean {
      if (!RECALL_WEBHOOK_SECRET) {
        return true; // Skip verification if no secret configured
      }

      // Recall uses HMAC-SHA256 for webhook signatures
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', RECALL_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    },
  };
}

/**
 * Map Recall bot status to meeting status
 */
export function mapRecallStatusToMeetingStatus(
  recallStatus: string
): 'SCHEDULED' | 'BOT_JOINING' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED' {
  switch (recallStatus) {
    case 'ready':
    case 'joining':
      return 'BOT_JOINING';
    case 'in_call_not_recording':
    case 'in_call_recording':
      return 'RECORDING';
    case 'call_ended':
    case 'processing':
      return 'PROCESSING';
    case 'done':
    case 'analysis_done':
      return 'READY';
    case 'fatal':
      return 'FAILED';
    default:
      return 'SCHEDULED';
  }
}
