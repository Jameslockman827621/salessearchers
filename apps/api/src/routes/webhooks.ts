// ===========================================
// Webhook Routes (Complete Implementation)
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@salessearchers/db';
import { recallWebhookEventSchema, logger, sha256 } from '@salessearchers/shared';
import { createRecallClient, mapRecallStatusToMeetingStatus } from '@salessearchers/integrations';
import { signalMeetingBotStatus, startCalendarSyncWorkflow } from '../lib/temporal';

export async function webhooksRoutes(app: FastifyInstance) {
  // Recall.ai webhook
  app.post('/recall', async (request: FastifyRequest, reply: FastifyReply) => {
    const recall = createRecallClient();
    const rawBody = JSON.stringify(request.body);
    const signature = request.headers['x-recall-signature'] as string | undefined;

    // Verify signature if configured
    if (process.env.RECALL_WEBHOOK_SECRET && signature) {
      const isValid = recall.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        logger.warn('Invalid Recall webhook signature');
        return reply.status(401).send({ error: 'Invalid signature' });
      }
    }

    // Parse and validate event
    let event;
    try {
      event = recallWebhookEventSchema.parse(request.body);
    } catch (error) {
      logger.warn('Invalid Recall webhook payload', { error });
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    const eventId = sha256(`${event.event}-${event.data.bot_id}-${JSON.stringify(event.data.status_changes ?? [])}`);

    // Idempotency check
    const existing = await prisma.webhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: 'recall',
          providerEventId: eventId,
        },
      },
    });

    if (existing?.processedAt) {
      logger.debug('Duplicate webhook event, skipping', { eventId });
      return { received: true };
    }

    // Find the meeting by bot ID
    const botSession = await prisma.meetingBotSession.findFirst({
      where: { providerBotId: event.data.bot_id },
      include: { meeting: true },
    });

    // Store event for processing
    await prisma.webhookEvent.upsert({
      where: {
        provider_providerEventId: {
          provider: 'recall',
          providerEventId: eventId,
        },
      },
      update: {
        payload: event as unknown as object,
        attempts: { increment: 1 },
      },
      create: {
        provider: 'recall',
        providerEventId: eventId,
        eventType: event.event,
        payload: event as unknown as object,
        tenantId: botSession?.meeting.tenantId,
      },
    });

    if (!botSession) {
      logger.warn('Bot session not found for webhook', { botId: event.data.bot_id });
      await prisma.webhookEvent.update({
        where: {
          provider_providerEventId: {
            provider: 'recall',
            providerEventId: eventId,
          },
        },
        data: {
          processedAt: new Date(),
          failureReason: 'Bot session not found',
        },
      });
      return { received: true };
    }

    try {
      // Update meeting status based on bot status
      if (event.data.status) {
        const newStatus = mapRecallStatusToMeetingStatus(event.data.status);

        await prisma.meeting.update({
          where: { id: botSession.meetingId },
          data: {
            status: newStatus,
            ...(newStatus === 'RECORDING' && !botSession.meeting.startedAt && {
              startedAt: new Date(),
            }),
            ...(newStatus === 'READY' && !botSession.meeting.endedAt && {
              endedAt: new Date(),
            }),
          },
        });

        // Update bot session
        const updateData: Parameters<typeof prisma.meetingBotSession.update>[0]['data'] = {
          providerPayload: event.data as unknown as object,
          joinAttempts: { increment: event.data.status === 'joining' ? 1 : 0 },
        };

        if (event.data.status === 'in_call_recording' && !botSession.joinedAt) {
          updateData.joinedAt = new Date();
        }

        if (['done', 'fatal', 'call_ended', 'analysis_done'].includes(event.data.status)) {
          updateData.leftAt = new Date();
          if (event.data.status === 'fatal') {
            updateData.failureReason = event.data.status_changes?.[event.data.status_changes.length - 1]?.message ?? 'Bot failed';
          }
        }

        await prisma.meetingBotSession.update({
          where: { id: botSession.id },
          data: updateData,
        });

        // Signal the workflow about status change
        await signalMeetingBotStatus(botSession.meetingId, event.data.status);

        logger.info('Updated meeting status from webhook', {
          meetingId: botSession.meetingId,
          status: newStatus,
          recallStatus: event.data.status,
        });
      }

      // Mark webhook as processed
      await prisma.webhookEvent.update({
        where: {
          provider_providerEventId: {
            provider: 'recall',
            providerEventId: eventId,
          },
        },
        data: { processedAt: new Date() },
      });
    } catch (error) {
      logger.error('Error processing Recall webhook', { eventId }, error as Error);
      await prisma.webhookEvent.update({
        where: {
          provider_providerEventId: {
            provider: 'recall',
            providerEventId: eventId,
          },
        },
        data: { failureReason: (error as Error).message },
      });
    }

    return { received: true };
  });

  // Google Calendar webhook (push notification)
  app.post('/google/calendar', async (request: FastifyRequest, reply: FastifyReply) => {
    const channelId = request.headers['x-goog-channel-id'] as string;
    const resourceId = request.headers['x-goog-resource-id'] as string;
    const resourceState = request.headers['x-goog-resource-state'] as string;

    logger.info('Google Calendar webhook received', {
      channelId,
      resourceId,
      resourceState,
    });

    if (resourceState === 'sync') {
      // Initial sync verification - just acknowledge
      return { received: true };
    }

    // Find the calendar connection by channel ID (stored in syncCursor or separate field)
    // For now, we'll trigger sync for all Google connections
    // In production, you'd store the channel ID mapping
    
    try {
      const connections = await prisma.calendarConnection.findMany({
        where: { provider: 'GOOGLE', isActive: true },
        select: { id: true, tenantId: true, userId: true },
      });

      for (const connection of connections) {
        try {
          await startCalendarSyncWorkflow({
            connectionId: connection.id,
            tenantId: connection.tenantId,
            userId: connection.userId,
            continuous: false,
          });
        } catch (error) {
          logger.warn('Failed to start sync for connection', { connectionId: connection.id });
        }
      }
    } catch (error) {
      logger.error('Error processing Google Calendar webhook', {}, error as Error);
    }

    return { received: true };
  });

  // Microsoft Graph webhook (change notification)
  app.post('/microsoft/calendar', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { validationToken?: string; value?: Array<{ subscriptionId: string }> };

    // Validation request from Microsoft
    if (body.validationToken) {
      reply.type('text/plain');
      return body.validationToken;
    }

    logger.info('Microsoft Graph webhook received', {
      count: body.value?.length ?? 0,
    });

    // Process change notifications
    if (body.value && body.value.length > 0) {
      try {
        // Find connections that match subscription IDs
        const connections = await prisma.calendarConnection.findMany({
          where: { provider: 'MICROSOFT', isActive: true },
          select: { id: true, tenantId: true, userId: true },
        });

        for (const connection of connections) {
          try {
            await startCalendarSyncWorkflow({
              connectionId: connection.id,
              tenantId: connection.tenantId,
              userId: connection.userId,
              continuous: false,
            });
          } catch (error) {
            logger.warn('Failed to start sync for connection', { connectionId: connection.id });
          }
        }
      } catch (error) {
        logger.error('Error processing Microsoft Graph webhook', {}, error as Error);
      }
    }

    return { received: true };
  });

  // BetterContact enrichment webhook
  // This receives enrichment results immediately without polling
  app.post('/bettercontact', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      id?: string;
      status?: string;
      credits_consumed?: number;
      data?: Array<{
        contact_first_name?: string;
        contact_last_name?: string;
        contact_email_address?: string;
        contact_email_address_status?: string;
        contact_phone_number?: string;
        contact_phone_number_status?: string;
        contact_job_title?: string;
        custom_fields?: {
          uuid?: string;
          contact_id?: string;
        };
      }>;
    };

    logger.info('BetterContact webhook received', {
      requestId: body.id,
      status: body.status,
      dataCount: body.data?.length ?? 0,
    });

    if (!body.id || !body.data) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    // Find the pending enrichment job by request ID
    const enrichmentJob = await prisma.enrichmentJob.findFirst({
      where: { 
        provider: 'bettercontact',
        requestData: {
          path: ['requestId'],
          equals: body.id,
        },
        status: 'PROCESSING',
      },
    });

    if (!enrichmentJob) {
      logger.warn('No pending enrichment job found for BetterContact webhook', { requestId: body.id });
      // Still return success to prevent retries
      return { received: true };
    }

    try {
      // Process each enriched contact
      for (const enrichedContact of body.data) {
        // Find the contact to update - try custom_fields.contact_id first, then uuid
        const contactId = enrichedContact.custom_fields?.contact_id ?? enrichedContact.custom_fields?.uuid;
        
        if (!contactId) {
          logger.warn('No contact ID in enriched data', { enrichedContact });
          continue;
        }

        // Update the contact with enriched data
        const updateData: {
          email?: string;
          phone?: string;
          title?: string;
          firstName?: string;
          lastName?: string;
          enrichmentData?: object;
          enrichedAt?: Date;
        } = {
          enrichedAt: new Date(),
          enrichmentData: enrichedContact as object,
        };

        // Only update fields if they have values and don't overwrite existing data
        if (enrichedContact.contact_email_address) {
          updateData.email = enrichedContact.contact_email_address;
        }
        if (enrichedContact.contact_phone_number) {
          updateData.phone = enrichedContact.contact_phone_number;
        }
        if (enrichedContact.contact_job_title) {
          updateData.title = enrichedContact.contact_job_title;
        }
        if (enrichedContact.contact_first_name) {
          updateData.firstName = enrichedContact.contact_first_name;
        }
        if (enrichedContact.contact_last_name) {
          updateData.lastName = enrichedContact.contact_last_name;
        }

        await prisma.contact.update({
          where: { id: contactId },
          data: updateData,
        });

        logger.info('Contact enriched via webhook', {
          contactId,
          email: !!enrichedContact.contact_email_address,
          phone: !!enrichedContact.contact_phone_number,
        });
      }

      // Mark the enrichment job as completed
      await prisma.enrichmentJob.update({
        where: { id: enrichmentJob.id },
        data: {
          status: 'COMPLETED',
          responseData: body as object,
          completedAt: new Date(),
          creditsUsed: body.credits_consumed ?? 0,
        },
      });

      logger.info('BetterContact webhook processed successfully', {
        requestId: body.id,
        contactsUpdated: body.data.length,
      });
    } catch (error) {
      logger.error('Error processing BetterContact webhook', { requestId: body.id }, error as Error);
      
      await prisma.enrichmentJob.update({
        where: { id: enrichmentJob.id },
        data: {
          status: 'FAILED',
          failureReason: (error as Error).message,
        },
      });
    }

    return { received: true };
  });

  // Health check for webhooks endpoint
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
