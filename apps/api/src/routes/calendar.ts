// ===========================================
// Calendar Routes (Complete Implementation)
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@salessearchers/db';
import {
  oauthCallbackSchema,
  calendarSyncOptionsSchema,
  NotFoundError,
  generateSecureToken,
  AUDIT_ACTIONS,
  logger,
} from '@salessearchers/shared';
import {
  createGoogleCalendarProvider,
  createMicrosoftCalendarProvider,
} from '@salessearchers/integrations';
import { startCalendarSyncWorkflow } from '../lib/temporal';
import { scheduleRecordingsForEvents } from '../lib/recording-policy';

export async function calendarRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  const googleProvider = createGoogleCalendarProvider();
  const microsoftProvider = createMicrosoftCalendarProvider();

  // List calendar connections
  app.get('/connections', async (request: FastifyRequest) => {
    await app.requirePermission('integrations.read')(request, {} as never);

    const userId = request.userId!;
    const tenantId = request.tenantId!;

    const connections = await prisma.calendarConnection.findMany({
      where: { userId, tenantId },
      select: {
        id: true,
        provider: true,
        email: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
        _count: {
          select: { calendarEvents: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: connections.map((c) => ({
        ...c,
        eventCount: c._count.calendarEvents,
        _count: undefined,
      })),
    };
  });

  // Get OAuth URL for Google
  app.get('/connect/google', async (request: FastifyRequest, reply: FastifyReply) => {
    await app.requirePermission('integrations.manage')(request, {} as never);

    const state = `${request.tenantId}:${request.userId}:${generateSecureToken(16)}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/calendar/callback/google';

    // Store state in cookie for verification
    reply.setCookie('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes
    });

    const authUrl = googleProvider.getAuthUrl(state, redirectUri);

    return {
      success: true,
      data: { authUrl },
    };
  });

  // Get OAuth URL for Microsoft
  app.get('/connect/microsoft', async (request: FastifyRequest, reply: FastifyReply) => {
    await app.requirePermission('integrations.manage')(request, {} as never);

    const state = `${request.tenantId}:${request.userId}:${generateSecureToken(16)}`;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? 'http://localhost:3001/api/calendar/callback/microsoft';

    reply.setCookie('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });

    const authUrl = microsoftProvider.getAuthUrl(state, redirectUri);

    return {
      success: true,
      data: { authUrl },
    };
  });

  // OAuth callback handler for Google
  app.get('/callback/google', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = oauthCallbackSchema.parse(request.query);
    const storedState = request.cookies['oauth_state'];

    if (!storedState || storedState !== query.state) {
      logger.warn('Invalid OAuth state', { expected: storedState, received: query.state });
      return reply.redirect('/settings/integrations?error=invalid_state');
    }

    if (query.error) {
      logger.warn('OAuth error from Google', { error: query.error });
      return reply.redirect(`/settings/integrations?error=${query.error}`);
    }

    // Parse state to get tenant and user
    const [tenantId, userId] = storedState.split(':');
    if (!tenantId || !userId) {
      return reply.redirect('/settings/integrations?error=invalid_state');
    }

    try {
      const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/calendar/callback/google';
      const tokens = await googleProvider.exchangeCode(query.code, redirectUri);

      // Get user email from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const userInfo = await response.json() as { email: string };

      // Upsert calendar connection
      const connection = await prisma.calendarConnection.upsert({
        where: {
          tenantId_userId_provider_email: {
            tenantId,
            userId,
            provider: 'GOOGLE',
            email: userInfo.email,
          },
        },
        update: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? undefined,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
          isActive: true,
        },
        create: {
          tenantId,
          userId,
          provider: 'GOOGLE',
          email: userInfo.email,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: AUDIT_ACTIONS.CALENDAR_CONNECTED,
          resource: 'calendar',
          resourceId: connection.id,
          details: { provider: 'google', email: userInfo.email },
        },
      });

      // Clear state cookie
      reply.clearCookie('oauth_state', { path: '/' });

      // Start calendar sync workflow
      try {
        await startCalendarSyncWorkflow({
          connectionId: connection.id,
          tenantId,
          userId,
          continuous: false, // Initial sync, not continuous
        });
      } catch (error) {
        logger.error('Failed to start calendar sync workflow', {}, error as Error);
      }

      // Redirect to settings page
      return reply.redirect('/settings/integrations?success=google');
    } catch (error) {
      logger.error('Google OAuth callback failed', {}, error as Error);
      return reply.redirect('/settings/integrations?error=oauth_failed');
    }
  });

  // OAuth callback handler for Microsoft
  app.get('/callback/microsoft', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = oauthCallbackSchema.parse(request.query);
    const storedState = request.cookies['oauth_state'];

    if (!storedState || storedState !== query.state) {
      return reply.redirect('/settings/integrations?error=invalid_state');
    }

    if (query.error) {
      return reply.redirect(`/settings/integrations?error=${query.error}`);
    }

    const [tenantId, userId] = storedState.split(':');
    if (!tenantId || !userId) {
      return reply.redirect('/settings/integrations?error=invalid_state');
    }

    try {
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? 'http://localhost:3001/api/calendar/callback/microsoft';
      const tokens = await microsoftProvider.exchangeCode(query.code, redirectUri);

      // Get user email from Microsoft Graph
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const userInfo = await response.json() as { mail?: string; userPrincipalName: string };
      const email = userInfo.mail ?? userInfo.userPrincipalName;

      // Upsert calendar connection
      const connection = await prisma.calendarConnection.upsert({
        where: {
          tenantId_userId_provider_email: {
            tenantId,
            userId,
            provider: 'MICROSOFT',
            email,
          },
        },
        update: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? undefined,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
          isActive: true,
        },
        create: {
          tenantId,
          userId,
          provider: 'MICROSOFT',
          email,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: AUDIT_ACTIONS.CALENDAR_CONNECTED,
          resource: 'calendar',
          resourceId: connection.id,
          details: { provider: 'microsoft', email },
        },
      });

      reply.clearCookie('oauth_state', { path: '/' });

      // Start calendar sync workflow
      try {
        await startCalendarSyncWorkflow({
          connectionId: connection.id,
          tenantId,
          userId,
          continuous: false,
        });
      } catch (error) {
        logger.error('Failed to start calendar sync workflow', {}, error as Error);
      }

      return reply.redirect('/settings/integrations?success=microsoft');
    } catch (error) {
      logger.error('Microsoft OAuth callback failed', {}, error as Error);
      return reply.redirect('/settings/integrations?error=oauth_failed');
    }
  });

  // Disconnect calendar
  app.delete('/connections/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('integrations.manage')(request, {} as never);

    const { id } = request.params;
    const userId = request.userId!;
    const tenantId = request.tenantId!;

    const connection = await prisma.calendarConnection.findFirst({
      where: { id, userId, tenantId },
    });

    if (!connection) {
      throw new NotFoundError('Calendar connection', id);
    }

    // Delete all associated calendar events first
    await prisma.calendarEvent.deleteMany({
      where: { calendarConnectionId: id },
    });

    await prisma.calendarConnection.delete({
      where: { id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.CALENDAR_DISCONNECTED,
        resource: 'calendar',
        resourceId: id,
        details: { provider: connection.provider, email: connection.email },
      },
    });

    return {
      success: true,
      data: { message: 'Calendar disconnected' },
    };
  });

  // Trigger manual sync
  app.post('/connections/:id/sync', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('integrations.manage')(request, {} as never);

    const { id } = request.params;
    const body = calendarSyncOptionsSchema.parse(request.body ?? {});
    const userId = request.userId!;
    const tenantId = request.tenantId!;

    const connection = await prisma.calendarConnection.findFirst({
      where: { id, userId, tenantId },
    });

    if (!connection) {
      throw new NotFoundError('Calendar connection', id);
    }

    // If full sync requested, clear the sync cursor
    if (body.fullSync) {
      await prisma.calendarConnection.update({
        where: { id },
        data: { syncCursor: null },
      });
    }

    // Start sync workflow
    await startCalendarSyncWorkflow({
      connectionId: id,
      tenantId,
      userId,
      continuous: false,
    });

    return {
      success: true,
      data: { message: 'Sync started' },
    };
  });

  // Schedule recordings for a calendar connection
  app.post('/connections/:id/schedule-recordings', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('meetings.create')(request, {} as never);

    const { id } = request.params;
    const userId = request.userId!;
    const tenantId = request.tenantId!;

    const connection = await prisma.calendarConnection.findFirst({
      where: { id, userId, tenantId },
    });

    if (!connection) {
      throw new NotFoundError('Calendar connection', id);
    }

    const result = await scheduleRecordingsForEvents(tenantId, userId, id);

    return {
      success: true,
      data: result,
    };
  });

  // List calendar events
  app.get('/events', async (request: FastifyRequest) => {
    await app.requirePermission('meetings.read')(request, {} as never);

    const userId = request.userId!;
    const tenantId = request.tenantId!;

    // Get user's calendar connections
    const connections = await prisma.calendarConnection.findMany({
      where: { userId, tenantId, isActive: true },
      select: { id: true },
    });

    if (connections.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    const events = await prisma.calendarEvent.findMany({
      where: {
        calendarConnectionId: { in: connections.map((c) => c.id) },
        startTime: { gte: new Date() },
        status: { not: 'cancelled' },
      },
      include: {
        meeting: {
          select: { id: true, status: true },
        },
        calendarConnection: {
          select: { provider: true, email: true },
        },
      },
      orderBy: { startTime: 'asc' },
      take: 100,
    });

    return {
      success: true,
      data: events,
    };
  });

  // Toggle recording for a specific event
  app.post('/events/:id/toggle-recording', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    await app.requirePermission('meetings.create')(request, {} as never);

    const { id } = request.params;
    const userId = request.userId!;
    const tenantId = request.tenantId!;

    const event = await prisma.calendarEvent.findUnique({
      where: { id },
      include: {
        calendarConnection: true,
        meeting: true,
      },
    });

    if (!event || event.calendarConnection.tenantId !== tenantId) {
      throw new NotFoundError('Calendar event', id);
    }

    // If meeting exists, cancel it
    if (event.meeting) {
      await prisma.meeting.update({
        where: { id: event.meeting.id },
        data: { status: 'CANCELLED' },
      });

      return {
        success: true,
        data: { recording: false, message: 'Recording cancelled' },
      };
    }

    // Create new meeting for recording
    if (!event.meetingUrl) {
      throw new Error('No meeting URL found for this event');
    }

    const meeting = await prisma.meeting.create({
      data: {
        tenantId,
        userId,
        meetingUrl: event.meetingUrl,
        title: event.title,
        platform: detectPlatform(event.meetingUrl),
        scheduledAt: event.startTime,
        status: 'SCHEDULED',
        calendarEventId: event.id,
      },
    });

    return {
      success: true,
      data: { recording: true, meetingId: meeting.id, message: 'Recording scheduled' },
    };
  });
}

function detectPlatform(url: string): 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | 'WEBEX' | 'OTHER' {
  if (url.includes('zoom.us')) return 'ZOOM';
  if (url.includes('meet.google.com')) return 'GOOGLE_MEET';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'TEAMS';
  if (url.includes('webex.com')) return 'WEBEX';
  return 'OTHER';
}
