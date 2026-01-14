import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@salessearchers/db';
import { createGmailProvider } from '@salessearchers/integrations';
import { logger } from '@salessearchers/shared';
import crypto from 'crypto';

const gmailProvider = createGmailProvider();

// Routes export
export async function emailRoutes(fastify: FastifyInstance) {
  // All routes except callbacks require authentication
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for callback and tracking routes
    const skipAuthPaths = ['/connections/gmail/callback', '/track/', '/unsubscribe/'];
    const shouldSkip = skipAuthPaths.some(path => request.url.includes(path));
    if (!shouldSkip) {
      await fastify.authenticate(request, reply);
    }
  });

  // =========================================
  // Email Connections
  // =========================================

  // Get all email connections for user
  fastify.get('/connections', async (request: FastifyRequest) => {
    const connections = await prisma.emailConnection.findMany({
      where: {
        tenantId: request.tenantId,
        userId: request.userId,
      },
      select: {
        id: true,
        provider: true,
        email: true,
        displayName: true,
        isActive: true,
        isPrimary: true,
        dailySendLimit: true,
        dailySentCount: true,
        lastSyncAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, data: connections };
  });

  // Get Gmail OAuth URL
  fastify.get('/connections/gmail/auth-url', async (request: FastifyRequest) => {
    const { redirectUri } = request.query as { redirectUri?: string };
    const state = crypto.randomBytes(32).toString('hex');
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Store state in audit log for verification
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'EMAIL_OAUTH_START',
        resource: 'EmailConnection',
        details: { state, provider: 'GMAIL' } as object,
      },
    });

    const url = gmailProvider.getAuthUrl({
      redirectUri: redirectUri ?? `${process.env.API_URL}/api/email/connections/gmail/callback`,
      state: `${tenantId}:${userId}:${state}`,
    });

    return { success: true, data: { url } };
  });

  // Gmail OAuth callback
  fastify.get('/connections/gmail/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    
    if (!code || !state) {
      return reply.redirect(`${process.env.WEB_URL}/settings/integrations?error=missing_params`);
    }

    const [tenantId, userId, _stateToken] = state.split(':');

    if (!tenantId || !userId) {
      return reply.redirect(`${process.env.WEB_URL}/settings/integrations?error=invalid_state`);
    }

    const redirectUri = `${process.env.API_URL}/api/email/connections/gmail/callback`;

    try {
      // Exchange code for tokens
      const tokens = await gmailProvider.exchangeCode(code, redirectUri);

      // Get user profile
      const profile = await gmailProvider.getProfile(tokens.accessToken);

      // Check if connection already exists
      const existing = await prisma.emailConnection.findUnique({
        where: {
          tenantId_userId_email: {
            tenantId,
            userId,
            email: profile.email,
          },
        },
      });

      // Count existing connections
      const connectionCount = await prisma.emailConnection.count({
        where: { tenantId, userId },
      });

      if (connectionCount >= 5 && !existing) {
        // Redirect with error - max 5 inboxes
        return reply.redirect(`${process.env.WEB_URL}/settings/integrations?error=max_connections`);
      }

      if (existing) {
        // Update existing connection
        await prisma.emailConnection.update({
          where: { id: existing.id },
          data: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken ?? existing.refreshToken,
            expiresAt: tokens.expiresAt,
            isActive: true,
          },
        });

        logger.info('Updated email connection', { connectionId: existing.id });
      } else {
        // Create new connection
        const isPrimary = connectionCount === 0;
        await prisma.emailConnection.create({
          data: {
            tenantId,
            userId,
            provider: 'GMAIL',
            email: profile.email,
            displayName: profile.name ?? profile.email,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken ?? null,
            expiresAt: tokens.expiresAt,
            isPrimary,
          },
        });

        logger.info('Created email connection', { email: profile.email });
      }

      // Redirect back to settings
      return reply.redirect(`${process.env.WEB_URL}/settings/integrations?success=email_connected`);
    } catch (error) {
      logger.error('Gmail OAuth callback failed', { error });
      return reply.redirect(`${process.env.WEB_URL}/settings/integrations?error=oauth_failed`);
    }
  });

  // Delete email connection
  fastify.delete('/connections/:connectionId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { connectionId } = request.params as { connectionId: string };

    const connection = await prisma.emailConnection.findFirst({
      where: {
        id: connectionId,
        tenantId: request.tenantId,
        userId: request.userId,
      },
    });

    if (!connection) {
      return reply.code(404).send({ success: false, error: 'Connection not found' });
    }

    // Check for active enrollments
    const activeEnrollments = await prisma.sequenceEnrollment.count({
      where: {
        emailConnectionId: connectionId,
        status: 'ACTIVE',
      },
    });

    if (activeEnrollments > 0) {
      return reply.code(400).send({ success: false, error: 'Cannot delete connection with active sequence enrollments' });
    }

    await prisma.emailConnection.delete({
      where: { id: connectionId },
    });

    logger.info('Deleted email connection', { connectionId });

    return { success: true };
  });

  // Set primary connection
  fastify.put('/connections/:connectionId/primary', async (request: FastifyRequest, reply: FastifyReply) => {
    const { connectionId } = request.params as { connectionId: string };

    const connection = await prisma.emailConnection.findFirst({
      where: {
        id: connectionId,
        tenantId: request.tenantId,
        userId: request.userId,
      },
    });

    if (!connection) {
      return reply.code(404).send({ success: false, error: 'Connection not found' });
    }

    // Unset all other primaries
    await prisma.emailConnection.updateMany({
      where: { tenantId: request.tenantId!, userId: request.userId! },
      data: { isPrimary: false },
    });

    // Set this one as primary
    await prisma.emailConnection.update({
      where: { id: connectionId },
      data: { isPrimary: true },
    });

    return { success: true };
  });

  // Trigger sync for connection
  fastify.post('/connections/:connectionId/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    const { connectionId } = request.params as { connectionId: string };

    const connection = await prisma.emailConnection.findFirst({
      where: {
        id: connectionId,
        tenantId: request.tenantId,
        userId: request.userId,
      },
    });

    if (!connection) {
      return reply.code(404).send({ success: false, error: 'Connection not found' });
    }

    // Start email sync workflow via Temporal
    try {
      const { startEmailSyncWorkflow } = await import('../lib/temporal.js');
      await startEmailSyncWorkflow({
        connectionId,
        tenantId: request.tenantId!,
        userId: request.userId!,
      });
      logger.info('Started email sync', { connectionId });
      return { success: true, message: 'Sync started' };
    } catch (error) {
      logger.error('Failed to start email sync', { error, connectionId });
      return reply.code(500).send({ success: false, error: 'Failed to start sync' });
    }
  });

  // =========================================
  // Inbox (Threads & Messages)
  // =========================================

  // List email threads
  fastify.get('/threads', async (request: FastifyRequest) => {
    const query = request.query as {
      connectionId?: string;
      contactId?: string;
      dealId?: string;
      isArchived?: string;
      isStarred?: string;
      search?: string;
      limit?: string;
      cursor?: string;
    };

    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const where: Record<string, unknown> = { tenantId: request.tenantId };

    if (query.connectionId) where.emailConnectionId = query.connectionId;
    if (query.contactId) where.contactId = query.contactId;
    if (query.dealId) where.dealId = query.dealId;
    if (query.isArchived !== undefined) where.isArchived = query.isArchived === 'true';
    if (query.isStarred !== undefined) where.isStarred = query.isStarred === 'true';

    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        { snippet: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const threads = await prisma.emailThread.findMany({
      where,
      include: {
        messages: {
          orderBy: { receivedAt: 'desc' },
          take: 1,
        },
        emailConnection: {
          select: { email: true, displayName: true },
        },
        contact: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
    });

    const hasMore = threads.length > limit;
    const resultThreads = hasMore ? threads.slice(0, -1) : threads;

    return {
      success: true,
      data: {
        threads: resultThreads.map((t) => ({
          ...t,
          latestMessage: t.messages[0],
          connection: t.emailConnection,
        })),
        nextCursor: hasMore ? resultThreads[resultThreads.length - 1].id : null,
      },
    };
  });

  // Get single thread with all messages
  fastify.get('/threads/:threadId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { threadId } = request.params as { threadId: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id: threadId, tenantId: request.tenantId },
      include: {
        messages: {
          orderBy: { receivedAt: 'asc' },
          include: {
            trackingEvents: true,
          },
        },
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        deal: {
          select: { id: true, name: true },
        },
      },
    });

    if (!thread) {
      return reply.code(404).send({ success: false, error: 'Thread not found' });
    }

    // Mark all messages as read
    await prisma.emailMessage.updateMany({
      where: { threadId, isRead: false },
      data: { isRead: true },
    });

    await prisma.emailThread.update({
      where: { id: threadId },
      data: { unreadCount: 0 },
    });

    return { success: true, data: thread };
  });

  // Archive thread
  fastify.put('/threads/:threadId/archive', async (request: FastifyRequest, reply: FastifyReply) => {
    const { threadId } = request.params as { threadId: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id: threadId, tenantId: request.tenantId },
    });

    if (!thread) {
      return reply.code(404).send({ success: false, error: 'Thread not found' });
    }

    await prisma.emailThread.update({
      where: { id: threadId },
      data: { isArchived: true },
    });

    return { success: true };
  });

  // Star thread
  fastify.put('/threads/:threadId/star', async (request: FastifyRequest, reply: FastifyReply) => {
    const { threadId } = request.params as { threadId: string };

    const thread = await prisma.emailThread.findFirst({
      where: { id: threadId, tenantId: request.tenantId },
    });

    if (!thread) {
      return reply.code(404).send({ success: false, error: 'Thread not found' });
    }

    const newStarred = !thread.isStarred;

    await prisma.emailThread.update({
      where: { id: threadId },
      data: { isStarred: newStarred },
    });

    return { success: true, data: { isStarred: newStarred } };
  });

  // Link thread to contact
  fastify.put('/threads/:threadId/link', async (request: FastifyRequest, reply: FastifyReply) => {
    const { threadId } = request.params as { threadId: string };
    const { contactId, dealId } = request.body as { contactId: string | null; dealId: string | null };

    const thread = await prisma.emailThread.findFirst({
      where: { id: threadId, tenantId: request.tenantId },
    });

    if (!thread) {
      return reply.code(404).send({ success: false, error: 'Thread not found' });
    }

    await prisma.emailThread.update({
      where: { id: threadId },
      data: { contactId, dealId },
    });

    return { success: true };
  });

  // =========================================
  // Send Email
  // =========================================

  // Send new email or reply
  fastify.post('/send', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      connectionId: string;
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      bodyHtml?: string;
      bodyText?: string;
      threadId?: string;
      contactId?: string;
      dealId?: string;
    };

    const tenantId = request.tenantId!;

    // Get connection
    const connection = await prisma.emailConnection.findFirst({
      where: {
        id: body.connectionId,
        tenantId,
      },
    });

    if (!connection) {
      return reply.code(404).send({ success: false, error: 'Email connection not found' });
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (connection.dailySentResetAt && connection.dailySentResetAt < today) {
      await prisma.emailConnection.update({
        where: { id: connection.id },
        data: { dailySentCount: 0, dailySentResetAt: new Date() },
      });
      connection.dailySentCount = 0;
    }

    if (connection.dailySentCount >= connection.dailySendLimit) {
      return reply.code(429).send({ success: false, error: 'Daily send limit reached' });
    }

    // Refresh token if needed
    if (connection.expiresAt && connection.expiresAt < new Date()) {
      if (connection.refreshToken) {
        try {
          const tokens = await gmailProvider.refreshToken(connection.refreshToken);
          await prisma.emailConnection.update({
            where: { id: connection.id },
            data: {
              accessToken: tokens.accessToken,
              expiresAt: tokens.expiresAt,
            },
          });
          connection.accessToken = tokens.accessToken;
        } catch (error) {
          logger.error('Failed to refresh token', { error, connectionId: connection.id });
          return reply.code(401).send({ success: false, error: 'Email connection expired, please reconnect' });
        }
      } else {
        return reply.code(401).send({ success: false, error: 'Email connection expired, please reconnect' });
      }
    }

    // Get existing thread for replies
    let externalThreadId: string | undefined;
    let dbThread: { id: string; externalThreadId: string; messages: { externalMessageId: string; headers: unknown }[] } | null = null;

    if (body.threadId) {
      dbThread = await prisma.emailThread.findFirst({
        where: { id: body.threadId, tenantId },
        include: {
          messages: {
            orderBy: { receivedAt: 'desc' },
            take: 1,
            select: { externalMessageId: true, headers: true },
          },
        },
      });

      if (dbThread) {
        externalThreadId = dbThread.externalThreadId;
      }
    }

    try {
      const result = await gmailProvider.sendMessage(connection.accessToken, {
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        bodyText: body.bodyText,
        threadId: externalThreadId,
      });

      // Ensure thread exists in DB
      if (!dbThread) {
        dbThread = await prisma.emailThread.create({
          data: {
            tenantId,
            emailConnectionId: connection.id,
            externalThreadId: result.threadId ?? result.id,
            subject: body.subject,
            participantEmails: [...body.to, ...(body.cc ?? [])],
            contactId: body.contactId,
            dealId: body.dealId,
            lastMessageAt: new Date(),
            messageCount: 1,
          },
          include: {
            messages: {
              select: { externalMessageId: true, headers: true },
            },
          },
        });
      } else {
        await prisma.emailThread.update({
          where: { id: dbThread.id },
          data: {
            lastMessageAt: new Date(),
            messageCount: { increment: 1 },
          },
        });
      }

      // Store message
      const message = await prisma.emailMessage.create({
        data: {
          tenantId,
          threadId: dbThread.id,
          externalMessageId: result.id,
          sentFromConnectionId: connection.id,
          fromEmail: connection.email,
          fromName: connection.displayName,
          toEmails: body.to,
          ccEmails: body.cc ?? [],
          bccEmails: body.bcc ?? [],
          subject: body.subject,
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText,
          sentAt: new Date(),
          receivedAt: new Date(),
          isOutbound: true,
          isRead: true,
        },
      });

      // Increment sent count
      await prisma.emailConnection.update({
        where: { id: connection.id },
        data: {
          dailySentCount: { increment: 1 },
          dailySentResetAt: connection.dailySentResetAt ?? new Date(),
        },
      });

      logger.info('Email sent', { messageId: result.id, to: body.to });

      return {
        success: true,
        data: {
          messageId: message.id,
          threadId: dbThread.id,
          externalMessageId: result.id,
        },
      };
    } catch (error) {
      logger.error('Failed to send email', { error });
      return reply.code(500).send({ success: false, error: 'Failed to send email' });
    }
  });

  // =========================================
  // Tracking
  // =========================================

  // Track email open (1x1 pixel)
  fastify.get('/track/:trackingId/open.gif', async (request: FastifyRequest, reply: FastifyReply) => {
    const { trackingId } = request.params as { trackingId: string };

    // Find message
    const message = await prisma.emailMessage.findUnique({
      where: { trackingId },
    });

    if (message) {
      // Record open event
      await prisma.emailTrackingEvent.create({
        data: {
          messageId: message.id,
          eventType: 'OPEN',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      });

      logger.debug('Email opened', { trackingId });
    }

    // Return 1x1 transparent GIF
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    reply.header('Content-Type', 'image/gif');
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    return pixel;
  });

  // Track link click
  fastify.get('/track/:trackingId/click', async (request: FastifyRequest, reply: FastifyReply) => {
    const { trackingId } = request.params as { trackingId: string };
    const { url } = request.query as { url?: string };

    if (!url) {
      return reply.code(400).send({ error: 'Missing url parameter' });
    }

    const message = await prisma.emailMessage.findUnique({
      where: { trackingId },
    });

    if (message) {
      await prisma.emailTrackingEvent.create({
        data: {
          messageId: message.id,
          eventType: 'CLICK',
          linkUrl: url,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      });

      logger.debug('Link clicked', { trackingId, url });
    }

    return reply.redirect(url);
  });

  // Handle unsubscribe
  fastify.get('/unsubscribe/:trackingId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { trackingId } = request.params as { trackingId: string };

    const message = await prisma.emailMessage.findUnique({
      where: { trackingId },
      include: { sequenceEnrollment: true },
    });

    if (message?.sequenceEnrollment) {
      // Find contact and mark as unsubscribed
      const enrollment = message.sequenceEnrollment;

      await prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'UNSUBSCRIBED',
          unsubscribedAt: new Date(),
        },
      });

      await prisma.contact.update({
        where: { id: enrollment.contactId },
        data: { unsubscribedAt: new Date() },
      });

      await prisma.sequenceEvent.create({
        data: {
          enrollmentId: enrollment.id,
          eventType: 'UNSUBSCRIBED',
          details: { messageTrackingId: trackingId } as object,
        },
      });

      logger.info('Contact unsubscribed', { contactId: enrollment.contactId });
    }

    // Show unsubscribe confirmation page
    return reply.redirect(`${process.env.WEB_URL}/unsubscribed`);
  });
}
