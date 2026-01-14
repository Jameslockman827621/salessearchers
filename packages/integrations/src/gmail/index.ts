import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { createLogger } from '@salessearchers/shared';

const logger = createLogger('gmail-provider');

export interface GmailTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface GmailProfile {
  email: string;
  name?: string;
  picture?: string;
}

export interface GmailThread {
  id: string;
  historyId: string;
  snippet: string;
  messages: GmailMessage[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  internalDate: string;
  payload: GmailMessagePayload;
}

export interface GmailMessagePayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers: Array<{ name: string; value: string }>;
  body?: { size: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePayload[];
}

export interface SendMessageOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface SendMessageResult {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface ListThreadsOptions {
  query?: string;
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
}

export interface ListThreadsResult {
  threads: Array<{ id: string; historyId: string; snippet: string }>;
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface GmailProvider {
  getAuthUrl(options: { state?: string; redirectUri: string }): string;
  exchangeCode(code: string, redirectUri: string): Promise<GmailTokens>;
  refreshToken(refreshToken: string): Promise<GmailTokens>;
  getProfile(accessToken: string): Promise<GmailProfile>;
  listThreads(accessToken: string, options?: ListThreadsOptions): Promise<ListThreadsResult>;
  getThread(accessToken: string, threadId: string): Promise<GmailThread>;
  sendMessage(accessToken: string, options: SendMessageOptions): Promise<SendMessageResult>;
  markAsRead(accessToken: string, messageId: string): Promise<void>;
  archiveThread(accessToken: string, threadId: string): Promise<void>;
  starThread(accessToken: string, threadId: string): Promise<void>;
}

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function createGmailProvider(): GmailProvider {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;

  function createOAuth2Client(redirectUri?: string): OAuth2Client {
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  function createGmailClient(accessToken: string): gmail_v1.Gmail {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  return {
    getAuthUrl(options) {
      const oauth2Client = createOAuth2Client(options.redirectUri);
      return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: GMAIL_SCOPES,
        state: options.state,
      });
    },

    async exchangeCode(code, redirectUri) {
      const oauth2Client = createOAuth2Client(redirectUri);
      const { tokens } = await oauth2Client.getToken(code);

      logger.info('Exchanged code for tokens');

      return {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        scope: tokens.scope ?? undefined,
      };
    },

    async refreshToken(refreshToken) {
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();

      logger.info('Refreshed access token');

      return {
        accessToken: credentials.access_token!,
        refreshToken: credentials.refresh_token ?? refreshToken,
        expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
      };
    },

    async getProfile(accessToken) {
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data } = await oauth2.userinfo.get();

      return {
        email: data.email!,
        name: data.name ?? undefined,
        picture: data.picture ?? undefined,
      };
    },

    async listThreads(accessToken, options = {}) {
      const gmail = createGmailClient(accessToken);

      const { data } = await gmail.users.threads.list({
        userId: 'me',
        maxResults: options.maxResults ?? 50,
        pageToken: options.pageToken,
        q: options.query,
        labelIds: options.labelIds,
      });

      const threads = (data.threads ?? []).map((t) => ({
        id: t.id!,
        historyId: t.historyId ?? '',
        snippet: t.snippet ?? '',
      }));

      logger.debug('Listed threads', { count: threads.length });

      return {
        threads,
        nextPageToken: data.nextPageToken ?? undefined,
        resultSizeEstimate: data.resultSizeEstimate ?? 0,
      };
    },

    async getThread(accessToken, threadId) {
      const gmail = createGmailClient(accessToken);

      const { data } = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      });

      const messages = (data.messages ?? []).map((m) => ({
        id: m.id!,
        threadId: m.threadId!,
        labelIds: m.labelIds as string[] | undefined,
        snippet: m.snippet ?? '',
        internalDate: m.internalDate ?? '0',
        payload: m.payload as GmailMessagePayload,
      }));

      return {
        id: data.id!,
        historyId: data.historyId ?? '',
        snippet: data.snippet ?? '',
        messages,
      };
    },

    async sendMessage(accessToken, options) {
      const gmail = createGmailClient(accessToken);

      // Build MIME message
      const boundary = 'salessearchers_boundary_' + Date.now();
      const headers: string[] = [];

      headers.push(`To: ${options.to.join(', ')}`);
      if (options.cc?.length) headers.push(`Cc: ${options.cc.join(', ')}`);
      if (options.bcc?.length) headers.push(`Bcc: ${options.bcc.join(', ')}`);
      headers.push(`Subject: =?UTF-8?B?${Buffer.from(options.subject).toString('base64')}?=`);
      headers.push('MIME-Version: 1.0');

      if (options.inReplyTo) headers.push(`In-Reply-To: ${options.inReplyTo}`);
      if (options.references) headers.push(`References: ${options.references}`);

      // Build multipart message
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      headers.push('');

      const parts: string[] = [];
      
      if (options.bodyText) {
        parts.push(`--${boundary}`);
        parts.push('Content-Type: text/plain; charset="UTF-8"');
        parts.push('Content-Transfer-Encoding: quoted-printable');
        parts.push('');
        parts.push(options.bodyText);
      }

      if (options.bodyHtml) {
        parts.push(`--${boundary}`);
        parts.push('Content-Type: text/html; charset="UTF-8"');
        parts.push('Content-Transfer-Encoding: quoted-printable');
        parts.push('');
        parts.push(options.bodyHtml);
      }

      parts.push(`--${boundary}--`);

      const rawMessage = [...headers, ...parts].join('\r\n');
      const encoded = Buffer.from(rawMessage).toString('base64url');

      const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encoded,
          threadId: options.threadId,
        },
      });

      logger.info('Sent email', { messageId: data.id, threadId: data.threadId });

      return {
        id: data.id!,
        threadId: data.threadId!,
        labelIds: data.labelIds as string[],
      };
    },

    async markAsRead(accessToken, messageId) {
      const gmail = createGmailClient(accessToken);

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });

      logger.debug('Marked message as read', { messageId });
    },

    async archiveThread(accessToken, threadId) {
      const gmail = createGmailClient(accessToken);

      await gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: {
          removeLabelIds: ['INBOX'],
        },
      });

      logger.debug('Archived thread', { threadId });
    },

    async starThread(accessToken, threadId) {
      const gmail = createGmailClient(accessToken);

      // Get first message in thread
      const { data: thread } = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'minimal',
      });

      const messageId = thread.messages?.[0]?.id;
      if (messageId) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: ['STARRED'],
          },
        });
      }

      logger.debug('Starred thread', { threadId });
    },
  };
}

// Helper functions for parsing message content
export function parseMessageHeaders(
  headers: Array<{ name: string; value: string }>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    result[header.name.toLowerCase()] = header.value;
  }
  return result;
}

export function extractEmailBody(payload: GmailMessagePayload): {
  html: string | null;
  text: string | null;
} {
  let html: string | null = null;
  let text: string | null = null;

  function processPayload(p: GmailMessagePayload) {
    if (p.mimeType === 'text/plain' && p.body?.data) {
      text = Buffer.from(p.body.data, 'base64url').toString('utf-8');
    } else if (p.mimeType === 'text/html' && p.body?.data) {
      html = Buffer.from(p.body.data, 'base64url').toString('utf-8');
    }

    if (p.parts) {
      for (const part of p.parts) {
        processPayload(part);
      }
    }
  }

  processPayload(payload);
  return { html, text };
}

export function extractAttachments(payload: GmailMessagePayload): Array<{
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}> {
  const attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }> = [];

  function processPayload(p: GmailMessagePayload) {
    if (p.filename && p.body?.attachmentId) {
      attachments.push({
        filename: p.filename,
        mimeType: p.mimeType ?? 'application/octet-stream',
        size: p.body.size,
        attachmentId: p.body.attachmentId,
      });
    }

    if (p.parts) {
      for (const part of p.parts) {
        processPayload(part);
      }
    }
  }

  processPayload(payload);
  return attachments;
}
