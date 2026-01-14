// ===========================================
// Temporal Activities (Complete Implementation)
// ===========================================

import { prisma } from '@salessearchers/db';
import {
  createRecallClient,
  createStorageClient,
  createOpenAIClient,
  createGoogleCalendarProvider,
  createMicrosoftCalendarProvider,
  type CalendarEvent,
} from '@salessearchers/integrations';
import { logger } from '@salessearchers/shared';

const recall = createRecallClient();
const storage = createStorageClient();
const openai = createOpenAIClient();
const googleCalendar = createGoogleCalendarProvider();
const microsoftCalendar = createMicrosoftCalendarProvider();

// ===========================================
// Meeting Bot Activities
// ===========================================

export async function createRecallBot(input: {
  meetingId: string;
  meetingUrl: string;
  tenantId: string;
  webhookUrl: string;
}): Promise<{ botId: string }> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    include: { user: true },
  });

  if (!meeting) {
    throw new Error(`Meeting ${input.meetingId} not found`);
  }

  // Create bot via Recall.ai
  const bot = await recall.createBot({
    meeting_url: input.meetingUrl,
    bot_name: `Notetaker (${meeting.user?.firstName || 'Meeting'})`,
    transcription_options: {
      provider: 'default',
    },
    recording_mode: 'speaker_view',
    chat: {
      on_bot_join: {
        send_to: 'everyone',
        message: 'This meeting is being recorded for note-taking purposes.',
      },
    },
    automatic_leave: {
      waiting_room_timeout: 300, // 5 minutes
      noone_joined_timeout: 300,
      everyone_left_timeout: 30,
    },
  });

  // Store bot session
  await prisma.meetingBotSession.create({
    data: {
      meetingId: input.meetingId,
      provider: 'recall',
      providerBotId: bot.id,
    },
  });

  logger.info('Created Recall bot', {
    meetingId: input.meetingId,
    botId: bot.id,
  });

  return { botId: bot.id };
}

export async function joinMeeting(input: { botId: string }): Promise<void> {
  // Recall bots auto-join when created with a meeting URL
  // This activity can be used for additional join logic if needed
  logger.info('Bot joining meeting', { botId: input.botId });
}

export async function getMeetingStatus(input: { botId: string }): Promise<{ status: string }> {
  const bot = await recall.getBot(input.botId);
  return { status: bot.status_changes?.[bot.status_changes.length - 1]?.code ?? 'unknown' };
}

export async function downloadRecording(input: {
  meetingId: string;
  botId: string;
}): Promise<void> {
  const bot = await recall.getBot(input.botId);
  
  // Get recording URL from Recall
  if (bot.video_url) {
    // Download video and upload to our storage
    const videoResponse = await fetch(bot.video_url);
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    
    const storageKey = `recordings/${input.meetingId}/video.mp4`;
    await storage.uploadFromBuffer(storageKey, videoBuffer, 'video/mp4');
    
    // Store asset reference
    await prisma.meetingAsset.create({
      data: {
        meetingId: input.meetingId,
        type: 'video',
        storageKey,
        mimeType: 'video/mp4',
        sizeBytes: videoBuffer.length,
      },
    });
    
    logger.info('Downloaded and stored recording', {
      meetingId: input.meetingId,
      storageKey,
    });
  }

  // Get audio if available separately
  if (bot.audio_url && !bot.video_url) {
    const audioResponse = await fetch(bot.audio_url);
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    
    const storageKey = `recordings/${input.meetingId}/audio.mp3`;
    await storage.uploadFromBuffer(storageKey, audioBuffer, 'audio/mpeg');
    
    await prisma.meetingAsset.create({
      data: {
        meetingId: input.meetingId,
        type: 'audio',
        storageKey,
        mimeType: 'audio/mpeg',
        sizeBytes: audioBuffer.length,
      },
    });
  }
}

export async function processTranscript(input: { meetingId: string }): Promise<void> {
  const botSession = await prisma.meetingBotSession.findFirst({
    where: { meetingId: input.meetingId },
    orderBy: { createdAt: 'desc' },
  });

  if (!botSession?.providerBotId) {
    throw new Error('Bot session not found');
  }

  const transcript = await recall.getTranscript(botSession.providerBotId);
  
  if (!transcript || transcript.length === 0) {
    logger.warn('No transcript available', { meetingId: input.meetingId });
    return;
  }

  // Format transcript
  const segments = transcript.map((segment: {
    speaker: string;
    words: Array<{ text: string; start: number; end: number }>;
  }) => ({
    speaker: segment.speaker,
    startTime: segment.words[0]?.start ?? 0,
    endTime: segment.words[segment.words.length - 1]?.end ?? 0,
    text: segment.words.map((w) => w.text).join(' '),
  }));

  const fullText = segments
    .map((s) => `${s.speaker}: ${s.text}`)
    .join('\n\n');

  // Store transcript
  await prisma.meetingTranscript.create({
    data: {
      meetingId: input.meetingId,
      text: fullText,
      segments: segments,
    },
  });

  // Calculate duration
  const maxEndTime = Math.max(...segments.map((s) => s.endTime));
  await prisma.meeting.update({
    where: { id: input.meetingId },
    data: { duration: Math.round(maxEndTime) },
  });

  logger.info('Processed transcript', {
    meetingId: input.meetingId,
    segmentCount: segments.length,
    duration: maxEndTime,
  });
}

export async function updateMeetingStatus(input: {
  meetingId: string;
  status: string;
  error?: string;
}): Promise<void> {
  const updates: Parameters<typeof prisma.meeting.update>[0]['data'] = {
    status: input.status as 'SCHEDULED' | 'BOT_JOINING' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED',
  };

  if (input.status === 'RECORDING') {
    updates.startedAt = new Date();
  } else if (['READY', 'FAILED', 'CANCELLED'].includes(input.status)) {
    updates.endedAt = new Date();
  }

  await prisma.meeting.update({
    where: { id: input.meetingId },
    data: updates,
  });
}

export async function triggerInsightsWorkflow(input: {
  meetingId: string;
  tenantId: string;
  userId: string;
}): Promise<void> {
  // This is a placeholder - the actual workflow triggering happens via the Temporal client
  // In this activity we just log that insights should be generated
  logger.info('Triggering insights workflow', input);
}

// ===========================================
// Meeting Insights Activities
// ===========================================

export async function getTranscript(input: { meetingId: string }): Promise<string | null> {
  const transcript = await prisma.meetingTranscript.findFirst({
    where: { meetingId: input.meetingId },
  });
  return transcript?.text ?? null;
}

export async function generateSummary(input: {
  transcript: string;
  meetingId: string;
}): Promise<string> {
  const response = await openai.generateMeetingSummary(input.transcript);
  return response;
}

export async function generateActionItems(input: {
  transcript: string;
  meetingId: string;
}): Promise<Array<{ text: string; assignee?: string; dueDate?: string }>> {
  const response = await openai.generateActionItems(input.transcript);
  return response;
}

export async function generateKeyTopics(input: {
  transcript: string;
  meetingId: string;
}): Promise<Array<{ topic: string; mentions?: number }>> {
  const response = await openai.generateKeyTopics(input.transcript);
  return response;
}

export async function generateObjections(input: {
  transcript: string;
  meetingId: string;
}): Promise<Array<{ text: string; response?: string; resolved?: boolean }>> {
  const response = await openai.generateObjections(input.transcript);
  return response;
}

export async function generateCoachingTips(input: {
  transcript: string;
  meetingId: string;
}): Promise<Array<{ tip: string; category?: string }>> {
  const response = await openai.generateCoachingTips(input.transcript);
  return response;
}

export async function saveInsights(input: {
  meetingId: string;
  tenantId: string;
  summary: string;
  actionItems: Array<{ text: string; assignee?: string; dueDate?: string }>;
  keyTopics: Array<{ topic: string; mentions?: number }>;
  objections: Array<{ text: string; response?: string; resolved?: boolean }>;
  coachingTips: Array<{ tip: string; category?: string }>;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED';
  regenerate: boolean;
}): Promise<void> {
  // Get next version number
  const latestInsight = await prisma.meetingInsight.findFirst({
    where: { meetingId: input.meetingId },
    orderBy: { version: 'desc' },
  });
  
  const version = (latestInsight?.version ?? 0) + 1;

  await prisma.meetingInsight.create({
    data: {
      meetingId: input.meetingId,
      version,
      summary: input.summary,
      actionItems: input.actionItems,
      keyTopics: input.keyTopics,
      objections: input.objections,
      coachingTips: input.coachingTips,
      sentiment: input.sentiment,
      model: 'gpt-4o-mini',
    },
  });

  logger.info('Saved meeting insights', {
    meetingId: input.meetingId,
    version,
  });
}

export async function createTasksFromActionItems(input: {
  meetingId: string;
  tenantId: string;
  userId: string;
  actionItems: Array<{ text: string; assignee?: string; dueDate?: string }>;
}): Promise<void> {
  for (const item of input.actionItems) {
    // Check if task already exists
    const existing = await prisma.task.findFirst({
      where: {
        tenantId: input.tenantId,
        source: 'meeting_insight',
        sourceId: input.meetingId,
        title: item.text,
      },
    });

    if (!existing) {
      await prisma.task.create({
        data: {
          tenantId: input.tenantId,
          title: item.text,
          source: 'meeting_insight',
          sourceId: input.meetingId,
          assigneeId: input.userId,
          creatorId: input.userId,
          dueAt: item.dueDate ? new Date(item.dueDate) : undefined,
          priority: 'MEDIUM',
        },
      });
    }
  }

  logger.info('Created tasks from action items', {
    meetingId: input.meetingId,
    count: input.actionItems.length,
  });
}

// ===========================================
// Calendar Sync Activities
// ===========================================

export async function getCalendarConnection(input: { connectionId: string }): Promise<{
  id: string;
  provider: 'GOOGLE' | 'MICROSOFT';
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  syncCursor: string | null;
  isActive: boolean;
} | null> {
  const connection = await prisma.calendarConnection.findUnique({
    where: { id: input.connectionId },
  });

  if (!connection) return null;

  return {
    id: connection.id,
    provider: connection.provider as 'GOOGLE' | 'MICROSOFT',
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    expiresAt: connection.expiresAt,
    syncCursor: connection.syncCursor,
    isActive: connection.isActive,
  };
}

export async function refreshCalendarToken(input: {
  connectionId: string;
  provider: 'GOOGLE' | 'MICROSOFT';
}): Promise<void> {
  const connection = await prisma.calendarConnection.findUnique({
    where: { id: input.connectionId },
  });

  if (!connection?.refreshToken) {
    throw new Error('No refresh token available');
  }

  let tokens;
  if (input.provider === 'GOOGLE') {
    tokens = await googleCalendar.refreshToken(connection.refreshToken);
  } else {
    tokens = await microsoftCalendar.refreshToken(connection.refreshToken);
  }

  await prisma.calendarConnection.update({
    where: { id: input.connectionId },
    data: {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      ...(tokens.refreshToken && { refreshToken: tokens.refreshToken }),
    },
  });

  logger.info('Refreshed calendar token', { connectionId: input.connectionId });
}

export async function fetchCalendarEvents(input: {
  connectionId: string;
  provider: 'GOOGLE' | 'MICROSOFT';
  accessToken: string;
  syncCursor: string | null;
}): Promise<{
  events: CalendarEvent[];
  nextSyncCursor: string | null;
}> {
  const now = new Date();
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  let result;
  if (input.provider === 'GOOGLE') {
    result = await googleCalendar.listEvents(input.accessToken, {
      timeMin: now,
      timeMax: twoWeeksFromNow,
      syncToken: input.syncCursor ?? undefined,
    });
  } else {
    result = await microsoftCalendar.listEvents(input.accessToken, {
      timeMin: now,
      timeMax: twoWeeksFromNow,
      deltaLink: input.syncCursor ?? undefined,
    });
  }

  return result;
}

export async function upsertCalendarEvents(input: {
  connectionId: string;
  events: CalendarEvent[];
}): Promise<void> {
  for (const event of input.events) {
    await prisma.calendarEvent.upsert({
      where: {
        calendarConnectionId_externalId: {
          calendarConnectionId: input.connectionId,
          externalId: event.id,
        },
      },
      update: {
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        attendees: event.attendees as object,
        organizerEmail: event.organizerEmail,
        meetingUrl: event.meetingUrl,
        status: event.status,
        isAllDay: event.isAllDay,
      },
      create: {
        calendarConnectionId: input.connectionId,
        externalId: event.id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        attendees: event.attendees as object,
        organizerEmail: event.organizerEmail,
        meetingUrl: event.meetingUrl,
        status: event.status,
        isAllDay: event.isAllDay,
      },
    });
  }

  logger.info('Upserted calendar events', {
    connectionId: input.connectionId,
    count: input.events.length,
  });
}

export async function updateCalendarSyncCursor(input: {
  connectionId: string;
  cursor: string;
}): Promise<void> {
  await prisma.calendarConnection.update({
    where: { id: input.connectionId },
    data: {
      syncCursor: input.cursor,
      lastSyncAt: new Date(),
    },
  });
}

export async function scheduleRecordingsForConnection(input: {
  connectionId: string;
  tenantId: string;
  userId: string;
}): Promise<void> {
  // This imports the scheduling logic from the API
  // In a real implementation, this would be in a shared package
  
  const now = new Date();
  const events = await prisma.calendarEvent.findMany({
    where: {
      calendarConnectionId: input.connectionId,
      startTime: { gte: now },
      status: 'confirmed',
      meeting: null,
      meetingUrl: { not: null },
    },
    orderBy: { startTime: 'asc' },
    take: 50,
  });

  // Get recording policy
  const policy = await prisma.recordingPolicy.findFirst({
    where: {
      OR: [
        { tenantId: input.tenantId, userId: input.userId },
        { tenantId: input.tenantId, isOrgDefault: true },
      ],
    },
    orderBy: { isOrgDefault: 'asc' },
  });

  // Default to EXTERNAL_ONLY if no policy
  const ruleType = policy?.ruleType ?? 'EXTERNAL_ONLY';

  // Get tenant domains for external detection
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { domain: true, settings: true },
  });

  const internalDomains: string[] = [];
  if (tenant?.domain) internalDomains.push(tenant.domain.toLowerCase());
  const settings = tenant?.settings as Record<string, unknown> | null;
  if (settings?.internalDomains && Array.isArray(settings.internalDomains)) {
    internalDomains.push(...(settings.internalDomains as string[]).map((d) => d.toLowerCase()));
  }

  for (const event of events) {
    let shouldRecord = false;

    if (ruleType === 'ALWAYS') {
      shouldRecord = true;
    } else if (ruleType === 'MANUAL_ONLY') {
      shouldRecord = false;
    } else if (ruleType === 'EXTERNAL_ONLY') {
      const attendees = (event.attendees as Array<{ email: string }>) ?? [];
      shouldRecord = attendees.some((a) => {
        const domain = a.email.split('@')[1]?.toLowerCase();
        return domain && !internalDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
      });
    } else if (ruleType === 'KEYWORD_INCLUDE' && policy?.keywords) {
      const title = (event.title ?? '').toLowerCase();
      shouldRecord = policy.keywords.some((k) => title.includes(k.toLowerCase()));
    } else if (ruleType === 'KEYWORD_EXCLUDE' && policy?.keywords) {
      const title = (event.title ?? '').toLowerCase();
      shouldRecord = !policy.keywords.some((k) => title.includes(k.toLowerCase()));
    }

    if (shouldRecord && event.meetingUrl) {
      await prisma.meeting.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          meetingUrl: event.meetingUrl,
          title: event.title,
          platform: detectPlatform(event.meetingUrl),
          scheduledAt: event.startTime,
          status: 'SCHEDULED',
          calendarEventId: event.id,
        },
      });
    }
  }

  logger.info('Scheduled recordings for connection', {
    connectionId: input.connectionId,
    eventsProcessed: events.length,
  });
}

function detectPlatform(url: string): 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | 'WEBEX' | 'OTHER' {
  if (url.includes('zoom.us')) return 'ZOOM';
  if (url.includes('meet.google.com')) return 'GOOGLE_MEET';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'TEAMS';
  if (url.includes('webex.com')) return 'WEBEX';
  return 'OTHER';
}

// ===========================================
// Email Sync Activities
// ===========================================

import {
  createGmailProvider,
  parseMessageHeaders,
  extractEmailBody,
  extractAttachments,
} from '@salessearchers/integrations';

const gmailProvider = createGmailProvider();

export async function getEmailConnection(input: { connectionId: string }): Promise<{
  id: string;
  provider: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  historyId: string | null;
  isActive: boolean;
} | null> {
  const connection = await prisma.emailConnection.findUnique({
    where: { id: input.connectionId },
  });

  if (!connection) return null;

  return {
    id: connection.id,
    provider: connection.provider,
    email: connection.email,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    expiresAt: connection.expiresAt,
    historyId: connection.historyId,
    isActive: connection.isActive,
  };
}

export async function refreshEmailToken(input: {
  connectionId: string;
  provider: string;
}): Promise<void> {
  const connection = await prisma.emailConnection.findUnique({
    where: { id: input.connectionId },
  });

  if (!connection?.refreshToken) {
    throw new Error('No refresh token available');
  }

  const tokens = await gmailProvider.refreshToken(connection.refreshToken);

  await prisma.emailConnection.update({
    where: { id: input.connectionId },
    data: {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    },
  });

  logger.info('Refreshed email token', { connectionId: input.connectionId });
}

export async function fetchGmailThreads(input: {
  connectionId: string;
  accessToken: string;
  maxResults?: number;
}): Promise<Array<{ id: string; historyId: string; snippet: string }>> {
  const result = await gmailProvider.listThreads(input.accessToken, {
    maxResults: input.maxResults ?? 50,
  });

  return result.threads;
}

export async function fetchGmailMessages(input: {
  connectionId: string;
  accessToken: string;
  threadId: string;
}): Promise<Array<{
  id: string;
  threadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string;
  receivedAt: Date;
  labels: string[];
  hasAttachments: boolean;
}>> {
  const thread = await gmailProvider.getThread(input.accessToken, input.threadId);
  
  return thread.messages.map((msg) => {
    const headers = parseMessageHeaders(msg.payload.headers);
    const body = extractEmailBody(msg.payload);
    const attachments = extractAttachments(msg.payload);

    // Parse from header
    const fromHeader = headers['from'] ?? '';
    const fromMatch = fromHeader.match(/^(.+?)\s*<(.+?)>$/) ?? [null, null, fromHeader];
    const fromName = fromMatch[1]?.replace(/"/g, '') ?? null;
    const fromEmail = fromMatch[2] ?? fromHeader;

    // Parse to header
    const toHeader = headers['to'] ?? '';
    const toEmails = toHeader.split(',').map((e) => e.trim().replace(/<|>/g, ''));

    return {
      id: msg.id,
      threadId: msg.threadId,
      fromEmail,
      fromName,
      toEmails,
      subject: headers['subject'] ?? null,
      bodyHtml: body.html,
      bodyText: body.text,
      snippet: msg.snippet,
      receivedAt: new Date(parseInt(msg.internalDate, 10)),
      labels: msg.labelIds ?? [],
      hasAttachments: attachments.length > 0,
    };
  });
}

export async function upsertEmailThreads(input: {
  connectionId: string;
  tenantId: string;
  threads: Array<{ id: string; historyId: string; snippet: string }>;
}): Promise<void> {
  for (const thread of input.threads) {
    await prisma.emailThread.upsert({
      where: {
        emailConnectionId_externalThreadId: {
          emailConnectionId: input.connectionId,
          externalThreadId: thread.id,
        },
      },
      update: {
        snippet: thread.snippet,
      },
      create: {
        tenantId: input.tenantId,
        emailConnectionId: input.connectionId,
        externalThreadId: thread.id,
        snippet: thread.snippet,
        lastMessageAt: new Date(),
      },
    });
  }

  logger.info('Upserted email threads', { connectionId: input.connectionId, count: input.threads.length });
}

export async function upsertEmailMessages(input: {
  connectionId: string;
  tenantId: string;
  threadId: string;
  messages: Array<{
    id: string;
    threadId: string;
    fromEmail: string;
    fromName: string | null;
    toEmails: string[];
    subject: string | null;
    bodyHtml: string | null;
    bodyText: string | null;
    snippet: string;
    receivedAt: Date;
    labels: string[];
    hasAttachments: boolean;
  }>;
}): Promise<void> {
  // Get or find DB thread
  const dbThread = await prisma.emailThread.findFirst({
    where: { emailConnectionId: input.connectionId, externalThreadId: input.threadId },
  });

  if (!dbThread) {
    logger.warn('Thread not found for messages', { threadId: input.threadId });
    return;
  }

  // Get connection email to determine outbound
  const connection = await prisma.emailConnection.findUnique({
    where: { id: input.connectionId },
  });

  for (const msg of input.messages) {
    const isOutbound = msg.fromEmail.toLowerCase() === connection?.email.toLowerCase();

    await prisma.emailMessage.upsert({
      where: {
        threadId_externalMessageId: {
          threadId: dbThread.id,
          externalMessageId: msg.id,
        },
      },
      update: {
        isRead: msg.labels.includes('UNREAD') ? false : true,
        labels: msg.labels,
      },
      create: {
        tenantId: input.tenantId,
        threadId: dbThread.id,
        externalMessageId: msg.id,
        sentFromConnectionId: isOutbound ? input.connectionId : null,
        fromEmail: msg.fromEmail,
        fromName: msg.fromName,
        toEmails: msg.toEmails,
        subject: msg.subject,
        bodyHtml: msg.bodyHtml,
        bodyText: msg.bodyText,
        snippet: msg.snippet,
        receivedAt: msg.receivedAt,
        isOutbound,
        isRead: !msg.labels.includes('UNREAD'),
        hasAttachments: msg.hasAttachments,
        labels: msg.labels,
      },
    });
  }

  // Update thread stats
  const messageCount = await prisma.emailMessage.count({ where: { threadId: dbThread.id } });
  const unreadCount = await prisma.emailMessage.count({ where: { threadId: dbThread.id, isRead: false } });
  const lastMessage = await prisma.emailMessage.findFirst({
    where: { threadId: dbThread.id },
    orderBy: { receivedAt: 'desc' },
  });

  await prisma.emailThread.update({
    where: { id: dbThread.id },
    data: {
      messageCount,
      unreadCount,
      lastMessageAt: lastMessage?.receivedAt,
      subject: lastMessage?.subject ?? dbThread.subject,
    },
  });

  logger.info('Upserted email messages', { threadId: dbThread.id, count: input.messages.length });
}

export async function updateEmailSyncCursor(input: { connectionId: string }): Promise<void> {
  await prisma.emailConnection.update({
    where: { id: input.connectionId },
    data: { lastSyncAt: new Date() },
  });
}

export async function detectReplies(input: {
  connectionId: string;
  tenantId: string;
}): Promise<void> {
  // Find recent inbound messages that might be replies to sequence emails
  const recentInbound = await prisma.emailMessage.findMany({
    where: {
      tenantId: input.tenantId,
      isOutbound: false,
      receivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: {
      thread: {
        include: {
          messages: {
            where: { sequenceEnrollmentId: { not: null } },
            take: 1,
          },
        },
      },
    },
  });

  for (const message of recentInbound) {
    const sequenceMessage = message.thread.messages[0];
    if (sequenceMessage?.sequenceEnrollmentId) {
      // This is a reply to a sequence email
      const enrollment = await prisma.sequenceEnrollment.findUnique({
        where: { id: sequenceMessage.sequenceEnrollmentId },
      });

      if (enrollment && enrollment.status === 'ACTIVE') {
        // Mark as replied
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'REPLIED', completedAt: new Date() },
        });

        await prisma.sequenceEvent.create({
          data: {
            enrollmentId: enrollment.id,
            eventType: 'REPLIED',
            details: { messageId: message.id },
          },
        });

        logger.info('Detected reply to sequence', {
          enrollmentId: enrollment.id,
          messageId: message.id,
        });
      }
    }
  }
}

// ===========================================
// Sequence Enrollment Activities
// ===========================================

export async function getEnrollmentDetails(input: { enrollmentId: string }): Promise<{
  id: string;
  status: string;
  currentStepNumber: number;
  totalSteps: number;
  contactId: string;
  contactEmail: string;
  emailConnectionId: string;
  variables: Record<string, string> | null;
} | null> {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: input.enrollmentId },
    include: {
      contact: { select: { email: true, firstName: true, lastName: true } },
      sequence: { include: { steps: true } },
    },
  });

  if (!enrollment) return null;

  return {
    id: enrollment.id,
    status: enrollment.status,
    currentStepNumber: enrollment.currentStepNumber,
    totalSteps: enrollment.sequence.steps.length,
    contactId: enrollment.contactId,
    contactEmail: enrollment.contact.email ?? '',
    emailConnectionId: enrollment.emailConnectionId,
    variables: enrollment.variables as Record<string, string> | null,
  };
}

export async function getSequenceStep(input: {
  sequenceId: string;
  stepNumber: number;
}): Promise<{
  id: string;
  stepType: string;
  delayDays: number;
  delayHours: number;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  isEnabled: boolean;
} | null> {
  const step = await prisma.sequenceStep.findUnique({
    where: {
      sequenceId_stepNumber: {
        sequenceId: input.sequenceId,
        stepNumber: input.stepNumber,
      },
    },
  });

  if (!step) return null;

  return {
    id: step.id,
    stepType: step.stepType,
    delayDays: step.delayDays,
    delayHours: step.delayHours,
    subject: step.subject,
    bodyHtml: step.bodyHtml,
    bodyText: step.bodyText,
    isEnabled: step.isEnabled,
  };
}

export async function sendSequenceEmail(input: {
  enrollmentId: string;
  stepId: string;
  stepNumber: number;
}): Promise<void> {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: input.enrollmentId },
    include: {
      contact: true,
      emailConnection: true,
      sequence: { select: { settings: true } },
    },
  });

  if (!enrollment) {
    throw new Error('Enrollment not found');
  }

  const step = await prisma.sequenceStep.findUnique({
    where: { id: input.stepId },
  });

  if (!step) {
    throw new Error('Step not found');
  }

  if (!enrollment.contact.email) {
    throw new Error('Contact has no email');
  }

  // Personalize content
  const variables = {
    firstName: enrollment.contact.firstName ?? '',
    lastName: enrollment.contact.lastName ?? '',
    email: enrollment.contact.email,
    companyId: enrollment.contact.companyId ?? '',
    ...((enrollment.variables as Record<string, string>) ?? {}),
  };

  let subject = step.subject ?? '';
  let bodyHtml = step.bodyHtml ?? '';
  let bodyText = step.bodyText ?? '';

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    subject = subject.replace(placeholder, value);
    bodyHtml = bodyHtml.replace(placeholder, value);
    bodyText = bodyText.replace(placeholder, value);
  }

  // Generate tracking ID
  const settings = enrollment.sequence.settings as { trackOpens?: boolean } | null;
  let trackingId: string | undefined;

  if (settings?.trackOpens) {
    trackingId = `seq-${input.enrollmentId}-${input.stepNumber}-${Date.now().toString(36)}`;
    const trackingPixel = `<img src="${process.env.API_URL ?? 'http://localhost:3001'}/api/email/track/${trackingId}/open.gif" width="1" height="1" style="display:none"/>`;
    bodyHtml += trackingPixel;
  }

  // Check token expiry and refresh if needed
  if (enrollment.emailConnection.expiresAt && enrollment.emailConnection.expiresAt < new Date()) {
    if (enrollment.emailConnection.refreshToken) {
      const tokens = await gmailProvider.refreshToken(enrollment.emailConnection.refreshToken);
      await prisma.emailConnection.update({
        where: { id: enrollment.emailConnectionId },
        data: { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt },
      });
      enrollment.emailConnection.accessToken = tokens.accessToken;
    }
  }

  // Send email
  const result = await gmailProvider.sendMessage(enrollment.emailConnection.accessToken, {
    to: [enrollment.contact.email],
    subject,
    bodyHtml,
    bodyText,
  });

  // Get or create thread in DB
  let dbThread = await prisma.emailThread.findFirst({
    where: {
      emailConnectionId: enrollment.emailConnectionId,
      externalThreadId: result.threadId,
    },
  });

  if (!dbThread) {
    dbThread = await prisma.emailThread.create({
      data: {
        tenantId: enrollment.tenantId,
        emailConnectionId: enrollment.emailConnectionId,
        externalThreadId: result.threadId,
        subject,
        participantEmails: [enrollment.contact.email],
        contactId: enrollment.contactId,
        lastMessageAt: new Date(),
        messageCount: 1,
      },
    });
  }

  // Store message
  await prisma.emailMessage.create({
    data: {
      tenantId: enrollment.tenantId,
      threadId: dbThread.id,
      externalMessageId: result.id,
      sentFromConnectionId: enrollment.emailConnectionId,
      fromEmail: enrollment.emailConnection.email,
      fromName: enrollment.emailConnection.displayName,
      toEmails: [enrollment.contact.email],
      subject,
      bodyHtml,
      bodyText,
      sentAt: new Date(),
      receivedAt: new Date(),
      isOutbound: true,
      isRead: true,
      sequenceEnrollmentId: input.enrollmentId,
      sequenceStepId: input.stepId,
      trackingId,
    },
  });

  // Update step stats
  await prisma.sequenceStep.update({
    where: { id: input.stepId },
    data: {
      stats: {
        sent: { increment: 1 },
      },
    },
  });

  // Update send count
  await prisma.emailConnection.update({
    where: { id: enrollment.emailConnectionId },
    data: { dailySentCount: { increment: 1 } },
  });

  logger.info('Sent sequence email', {
    enrollmentId: input.enrollmentId,
    stepNumber: input.stepNumber,
    to: enrollment.contact.email,
  });
}

export async function updateEnrollmentProgress(input: {
  enrollmentId: string;
  currentStepNumber: number;
  nextScheduledAt: Date | null;
}): Promise<void> {
  const step = await prisma.sequenceStep.findFirst({
    where: {
      sequence: { enrollments: { some: { id: input.enrollmentId } } },
      stepNumber: input.currentStepNumber,
    },
  });

  await prisma.sequenceEnrollment.update({
    where: { id: input.enrollmentId },
    data: {
      currentStepNumber: input.currentStepNumber,
      currentStepId: step?.id,
      nextScheduledAt: input.nextScheduledAt,
    },
  });
}

export async function recordSequenceEvent(input: {
  enrollmentId: string;
  eventType: string;
  stepNumber?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  await prisma.sequenceEvent.create({
    data: {
      enrollmentId: input.enrollmentId,
      eventType: input.eventType,
      stepNumber: input.stepNumber,
      details: input.details as object | undefined,
    },
  });
}

export async function checkForReply(input: { enrollmentId: string }): Promise<boolean> {
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: input.enrollmentId },
  });

  return enrollment?.status === 'REPLIED';
}

export async function completeEnrollment(input: {
  enrollmentId: string;
  status: 'COMPLETED' | 'REPLIED' | 'BOUNCED';
}): Promise<void> {
  await prisma.sequenceEnrollment.update({
    where: { id: input.enrollmentId },
    data: {
      status: input.status,
      completedAt: new Date(),
    },
  });
}
