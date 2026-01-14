// ===========================================
// Calls API Routes (Call-to-Call Mode)
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';
import { createOpenAIClient } from '@salessearchers/integrations';
import { startMeetingInsightsWorkflow } from '../lib/temporal';
import { sendCallWrapUpEmail } from '../services/smart-automations';

// ===========================================
// Schemas
// ===========================================

const startCallSchema = z.object({
  contactId: z.string().uuid(),
  title: z.string().optional(),
});

const endCallSchema = z.object({
  outcome: z.enum([
    'SEND_EMAIL',
    'FOLLOW_UP_LATER',
    'BOOKED_MEETING',
    'NOT_INTERESTED',
    'NO_ANSWER',
    'LEFT_VOICEMAIL',
    'WRONG_NUMBER',
    'COMPLETED',
  ]),
  notes: z.string().optional(),
  transcript: z.string().optional(),
  nextStepDate: z.coerce.date().optional(),
});

const generateBriefSchema = z.object({
  contactId: z.string().uuid(),
  customInstructions: z.string().optional(),
});

const wrapUpSchema = z.object({
  callId: z.string().uuid(),
  outcome: z.enum([
    'SEND_EMAIL',
    'FOLLOW_UP_LATER',
    'BOOKED_MEETING',
    'NOT_INTERESTED',
    'NO_ANSWER',
    'LEFT_VOICEMAIL',
    'WRONG_NUMBER',
    'COMPLETED',
  ]),
  notes: z.string().optional(),
  transcript: z.string().optional(),
  generateEmail: z.boolean().default(true),
  createTask: z.boolean().default(true),
  nextStepDate: z.coerce.date().optional(),
  taskTitle: z.string().optional(),
  previewOnly: z.boolean().default(false), // When true, only generate email draft without saving
  sendEmail: z.boolean().default(false), // When true, actually send the email
  emailSubject: z.string().optional(), // Custom email subject (if user edited the draft)
  emailBody: z.string().optional(), // Custom email body (if user edited the draft)
});

// ===========================================
// Routes
// ===========================================

export const callsRoutes: FastifyPluginAsync = async (fastify) => {
  const openai = createOpenAIClient();

  // ===========================================
  // Get Call Queue (contacts to call today)
  // ===========================================

  fastify.get('/queue', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Get contacts that have pending call tasks or haven't been contacted
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));

    // Get tasks due today that are call-related
    const callTasks = await prisma.task.findMany({
      where: {
        tenantId,
        assigneeId: userId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        OR: [
          { dueAt: { lte: todayEnd } },
          { title: { contains: 'call', mode: 'insensitive' } },
          { title: { contains: 'follow up', mode: 'insensitive' } },
          { source: 'call_wrap_up' },
        ],
      },
      include: {
        contact: {
          include: {
            company: { select: { id: true, name: true, domain: true } },
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { dueAt: 'asc' },
      ],
      take: 50,
    });

    // Get contacts without recent calls (need outreach)
    const recentlyCalledContactIds = await prisma.activity.findMany({
      where: {
        tenantId,
        type: 'call_made',
        occurredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { contactId: true },
    });

    const recentIds = recentlyCalledContactIds.map(a => a.contactId).filter(Boolean);

    const needsOutreach = await prisma.contact.findMany({
      where: {
        tenantId,
        id: { notIn: recentIds as string[] },
        phone: { not: null },
      },
      include: {
        company: { select: { id: true, name: true, domain: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return reply.send({
      success: true,
      data: {
        tasksToday: callTasks.map(t => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          dueAt: t.dueAt,
          contact: t.contact,
          type: 'task',
        })),
        needsOutreach: needsOutreach.map(c => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          title: c.title,
          company: c.company,
          type: 'outreach',
        })),
      },
    });
  });

  // ===========================================
  // Start Call
  // ===========================================

  fastify.post('/start', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = startCallSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Get contact info
    const contact = await prisma.contact.findFirst({
      where: { id: data.contactId, tenantId },
      include: { company: true },
    });

    if (!contact) {
      return reply.code(404).send({ success: false, error: 'Contact not found' });
    }

    // Create a meeting record for this call
    const callTitle = data.title || 
      `Call with ${[contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Contact'}`;

    const meeting = await prisma.meeting.create({
      data: {
        tenantId,
        userId,
        meetingUrl: `tel:${contact.phone || 'unknown'}`,
        title: callTitle,
        platform: 'OTHER',
        status: 'RECORDING', // Active call
        startedAt: new Date(),
      },
    });

    // Link contact as participant
    await prisma.meetingParticipant.create({
      data: {
        meetingId: meeting.id,
        contactId: contact.id,
        name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || undefined,
        email: contact.email ?? undefined,
        isExternal: true,
      },
    });

    // Create activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId,
        contactId: contact.id,
        companyId: contact.companyId,
        type: 'call_started',
        title: `Started call with ${contact.firstName || 'contact'}`,
        metadata: { meetingId: meeting.id } as Prisma.InputJsonValue,
      },
    });

    logger.info('Call started', { callId: meeting.id, contactId: contact.id });

    return reply.send({
      success: true,
      data: {
        callId: meeting.id,
        contact: {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          company: contact.company,
        },
        startedAt: meeting.startedAt,
      },
    });
  });

  // ===========================================
  // End Call
  // ===========================================

  fastify.post('/:callId/end', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const data = endCallSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id: callId, tenantId },
      include: {
        participants: { include: { contact: { include: { company: true } } } },
      },
    });

    if (!meeting) {
      return reply.code(404).send({ success: false, error: 'Call not found' });
    }

    const contact = meeting.participants[0]?.contact;
    const duration = meeting.startedAt 
      ? Math.round((Date.now() - meeting.startedAt.getTime()) / 1000)
      : 0;

    // Update meeting
    await prisma.meeting.update({
      where: { id: callId },
      data: {
        status: 'READY',
        endedAt: new Date(),
        duration,
      },
    });

    // Save transcript if provided
    if (data.transcript || data.notes) {
      await prisma.meetingTranscript.upsert({
        where: { meetingId: callId },
        create: {
          meetingId: callId,
          text: data.transcript || data.notes || '',
          segments: data.notes ? [{ speaker: 'Rep Notes', text: data.notes }] : undefined,
        },
        update: {
          text: data.transcript || data.notes || '',
          segments: data.notes ? [{ speaker: 'Rep Notes', text: data.notes }] : undefined,
        },
      });
    }

    // Create activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId,
        contactId: contact?.id,
        companyId: contact?.companyId,
        type: 'call_made',
        title: `Call ended: ${data.outcome.replace(/_/g, ' ').toLowerCase()}`,
        metadata: {
          meetingId: callId,
          outcome: data.outcome,
          duration,
          notes: data.notes,
        } as Prisma.InputJsonValue,
      },
    });

    logger.info('Call ended', { callId, outcome: data.outcome, duration });

    return reply.send({
      success: true,
      data: {
        callId,
        outcome: data.outcome,
        duration,
        contact: contact ? {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
        } : null,
      },
    });
  });

  // ===========================================
  // Full Wrap-up (End + Generate Email + Create Task)
  // ===========================================

  fastify.post('/wrap-up', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = wrapUpSchema.parse(request.body);
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const meeting = await prisma.meeting.findFirst({
      where: { id: data.callId, tenantId },
      include: {
        participants: { include: { contact: { include: { company: true } } } },
        transcript: true,
      },
    });

    if (!meeting) {
      return reply.code(404).send({ success: false, error: 'Call not found' });
    }

    const contact = meeting.participants[0]?.contact;
    const duration = meeting.startedAt
      ? Math.round((Date.now() - meeting.startedAt.getTime()) / 1000)
      : 0;

    // ===========================================
    // Preview Only Mode - Just generate email draft
    // ===========================================
    if (data.previewOnly) {
      let emailDraft = null;
      if (data.generateEmail && contact) {
        try {
          const context = {
            contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || undefined,
            contactTitle: contact.title ?? undefined,
            companyName: contact.company?.name ?? undefined,
            meetingSummary: data.notes ?? undefined,
            actionItems: undefined,
          };

          if (process.env.OPENAI_API_KEY) {
            emailDraft = await openai.generateFollowUpEmail(context);
          } else {
            // Provide default email when OpenAI is not configured
            emailDraft = {
              subject: `Great talking with you, ${context.contactName || 'there'}!`,
              body: `Hi ${context.contactName || 'there'},\n\nThank you for taking the time to chat today. I really enjoyed our conversation.\n\n${context.meetingSummary ? `As discussed: ${context.meetingSummary}\n\n` : ''}I'll follow up with the additional information we discussed. In the meantime, please don't hesitate to reach out if you have any questions.\n\nLooking forward to our next conversation.\n\nBest regards,\n[Your Name]`,
              tone: 'friendly' as const,
            };
          }
          
          logger.info('Generated email preview', { callId: data.callId, contactId: contact.id });
        } catch (error) {
          logger.error('Failed to generate email preview', { error });
        }
      }

      return reply.send({
        success: true,
        data: {
          callId: data.callId,
          outcome: data.outcome,
          duration,
          contact: contact ? {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
          } : null,
          insights: null,
          task: null,
          emailDraft: emailDraft ? {
            subject: emailDraft.subject,
            body: emailDraft.body,
            tone: emailDraft.tone,
          } : null,
        },
      });
    }

    // ===========================================
    // Full Wrap-up Mode
    // ===========================================

    // 1. Update meeting status
    await prisma.meeting.update({
      where: { id: data.callId },
      data: {
        status: 'READY',
        endedAt: new Date(),
        duration,
      },
    });

    // 2. Save transcript/notes
    const transcriptText = data.transcript || data.notes || '';
    if (transcriptText) {
      await prisma.meetingTranscript.upsert({
        where: { meetingId: data.callId },
        create: {
          meetingId: data.callId,
          text: transcriptText,
          segments: data.notes ? [{ speaker: 'Rep Notes', text: data.notes }] : undefined,
        },
        update: {
          text: transcriptText,
          segments: data.notes ? [{ speaker: 'Rep Notes', text: data.notes }] : undefined,
        },
      });
    }

    // 3. Generate insights if we have transcript
    let insights = null;
    if (transcriptText && transcriptText.length > 50 && process.env.OPENAI_API_KEY) {
      try {
        // Generate summary, action items, etc.
        const [summary, actionItems, keyTopics] = await Promise.all([
          openai.generateMeetingSummary(transcriptText),
          openai.generateActionItems(transcriptText),
          openai.generateKeyTopics(transcriptText),
        ]);

        insights = await prisma.meetingInsight.create({
          data: {
            meetingId: data.callId,
            version: 1,
            summary,
            actionItems: actionItems as Prisma.InputJsonValue,
            keyTopics: keyTopics as Prisma.InputJsonValue,
            sentiment: 'NEUTRAL',
            model: 'gpt-4o-mini',
          },
        });

        logger.info('Generated call insights', { callId: data.callId });
      } catch (error) {
        logger.error('Failed to generate insights', { error });
      }
    }

    // 4. Create follow-up task if needed
    let task = null;
    if (data.createTask && contact && ['SEND_EMAIL', 'FOLLOW_UP_LATER', 'LEFT_VOICEMAIL'].includes(data.outcome)) {
      const taskTitle = data.taskTitle || getDefaultTaskTitle(data.outcome, contact);
      const dueAt = data.nextStepDate || getDefaultDueDate(data.outcome);

      task = await prisma.task.create({
        data: {
          tenantId,
          title: taskTitle,
          source: 'call_wrap_up',
          sourceId: data.callId,
          assigneeId: userId,
          creatorId: userId,
          contactId: contact.id,
          dueAt,
          priority: data.outcome === 'SEND_EMAIL' ? 'HIGH' : 'MEDIUM',
        },
      });

      logger.info('Created follow-up task', { taskId: task.id, contactId: contact.id });
    }

    // 5. Generate follow-up email if needed
    let emailDraft = null;
    if (data.generateEmail && contact && data.outcome === 'SEND_EMAIL') {
      try {
        const context = {
          contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || undefined,
          contactTitle: contact.title ?? undefined,
          companyName: contact.company?.name ?? undefined,
          meetingSummary: insights?.summary ?? data.notes ?? undefined,
          actionItems: insights?.actionItems 
            ? (insights.actionItems as Array<{ text: string }>).map(a => a.text)
            : undefined,
        };

        if (process.env.OPENAI_API_KEY) {
          emailDraft = await openai.generateFollowUpEmail(context);
        } else {
          // Provide default email when OpenAI is not configured
          emailDraft = {
            subject: `Great talking with you, ${context.contactName || 'there'}!`,
            body: `Hi ${context.contactName || 'there'},\n\nThank you for taking the time to chat today. I really enjoyed our conversation.\n\n${context.meetingSummary ? `As discussed: ${context.meetingSummary}\n\n` : ''}I'll follow up with the additional information we discussed. In the meantime, please don't hesitate to reach out if you have any questions.\n\nLooking forward to our next conversation.\n\nBest regards,\n[Your Name]`,
            tone: 'friendly' as const,
          };
        }

        // Save generated content
        await prisma.generatedContent.create({
          data: {
            tenantId,
            userId,
            type: 'FOLLOW_UP_EMAIL',
            title: emailDraft.subject,
            content: emailDraft.body,
            sourceType: 'meeting',
            sourceId: data.callId,
            metadata: { tone: emailDraft.tone, contactId: contact.id } as Prisma.InputJsonValue,
          },
        });

        logger.info('Generated follow-up email', { callId: data.callId, contactId: contact.id });
      } catch (error) {
        logger.error('Failed to generate email', { error });
      }
    }

    // 5b. Actually send the email if requested
    let emailSent = null;
    if (data.sendEmail && contact && (emailDraft || (data.emailSubject && data.emailBody))) {
      const emailToSend = {
        subject: data.emailSubject || emailDraft?.subject || 'Follow-up',
        body: data.emailBody || emailDraft?.body || '',
      };

      const sendResult = await sendCallWrapUpEmail({
        tenantId,
        userId,
        meetingId: data.callId,
        contactId: contact.id,
        emailSubject: emailToSend.subject,
        emailBody: emailToSend.body,
      });

      emailSent = sendResult;

      if (sendResult.sent) {
        logger.info('Sent follow-up email', { callId: data.callId, contactId: contact.id, messageId: sendResult.messageId });
      } else {
        logger.warn('Failed to send follow-up email', { callId: data.callId, error: sendResult.error });
      }
    }

    // 6. Create activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId,
        contactId: contact?.id,
        companyId: contact?.companyId,
        type: 'call_made',
        title: `Call completed: ${data.outcome.replace(/_/g, ' ').toLowerCase()}`,
        metadata: {
          meetingId: data.callId,
          outcome: data.outcome,
          duration,
          hasInsights: !!insights,
          hasTask: !!task,
          hasEmailDraft: !!emailDraft,
        } as Prisma.InputJsonValue,
      },
    });

    return reply.send({
      success: true,
      data: {
        callId: data.callId,
        outcome: data.outcome,
        duration,
        contact: contact ? {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
        } : null,
        insights: insights ? {
          id: insights.id,
          summary: insights.summary,
          actionItems: insights.actionItems,
          keyTopics: insights.keyTopics,
        } : null,
        task: task ? {
          id: task.id,
          title: task.title,
          dueAt: task.dueAt,
        } : null,
        emailDraft: emailDraft ? {
          subject: emailDraft.subject,
          body: emailDraft.body,
          tone: emailDraft.tone,
        } : null,
        emailSent: emailSent ? {
          sent: emailSent.sent,
          messageId: emailSent.messageId,
          error: emailSent.error,
        } : null,
      },
    });
  });

  // ===========================================
  // Generate AI Brief for Contact
  // ===========================================

  fastify.post('/brief', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = generateBriefSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const contact = await prisma.contact.findFirst({
      where: { id: data.contactId, tenantId },
      include: { 
        company: true,
        activities: {
          orderBy: { occurredAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!contact) {
      return reply.code(404).send({ success: false, error: 'Contact not found' });
    }

    // Get tenant settings for product context
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const productContext = (tenant?.settings as Record<string, unknown>)?.productContext as string | undefined;

    // Build context for AI
    const context = {
      contactName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || undefined,
      contactTitle: contact.title ?? undefined,
      companyName: contact.company?.name ?? undefined,
      customInstructions: [
        productContext,
        data.customInstructions,
        `Recent activity: ${contact.activities.slice(0, 3).map(a => a.title).join(', ') || 'None'}`,
      ].filter(Boolean).join('\n'),
    };

    // Check if OpenAI is configured
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    
    let callScript = {
      opening: '',
      discovery: [] as string[],
      pitch: '',
      objectionHandlers: {} as Record<string, string>,
      close: '',
    };
    let personalizationBullets: string[] = [];

    if (hasOpenAI) {
      // Generate call script with AI
      try {
        callScript = await openai.generateCallScript(context);
      } catch (error) {
        logger.error('Failed to generate call script', { error });
      }

      // Generate personalization bullets
      const personalizationPrompt = `Generate 3-5 personalization bullets for calling ${contact.firstName || 'this contact'}${contact.title ? ` who is a ${contact.title}` : ''}${contact.company?.name ? ` at ${contact.company.name}` : ''}.
${contact.company?.industry ? `Industry: ${contact.company.industry}` : ''}
${productContext ? `Our product/service: ${productContext}` : ''}

Focus on:
- Why this could be relevant for them
- Potential pain points to explore
- Connection points or common ground

Return as JSON array of strings.`;

      try {
        const openaiClient = await import('openai').then(m => new m.default({ apiKey: process.env.OPENAI_API_KEY }));
        const response = await openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: personalizationPrompt }],
          response_format: { type: 'json_object' },
          max_tokens: 500,
        });
        const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}');
        personalizationBullets = Array.isArray(parsed) ? parsed : (parsed.bullets ?? parsed.personalization ?? []);
      } catch (error) {
        logger.error('Failed to generate personalization', { error });
      }
    } else {
      // Provide smart defaults when OpenAI is not configured
      const contactName = contact.firstName || 'there';
      const companyName = contact.company?.name || 'your company';
      const title = contact.title || 'your role';

      callScript = {
        opening: `Hi ${contactName}, this is [Your Name] from [Your Company]. I noticed you're the ${title} at ${companyName} and wanted to have a quick chat about how we might help your team.`,
        discovery: [
          `What are your biggest challenges right now as ${title}?`,
          `How does your team currently handle [relevant process]?`,
          `What would success look like for you in the next quarter?`,
          `Who else is typically involved in decisions like this?`,
          `What's held you back from solving this before?`,
        ],
        pitch: `Based on what you've shared, I think we could help ${companyName} by [value proposition]. Companies like yours have seen [specific results]. Would it be helpful if I showed you exactly how?`,
        objectionHandlers: {
          'Not interested': `I understand - can I ask what you're currently doing to handle [pain point]? Just curious if there's something we could help with down the road.`,
          'No budget': `Totally get it. What if I showed you how this pays for itself within [timeframe]? Would that change the conversation?`,
          'Already have a solution': `That makes sense. How's it working for you? Is there anything you wish it did better?`,
          'Send me an email': `Happy to do that. To make sure I send you something relevant - what's your biggest priority right now?`,
        },
        close: `Based on our chat, I think a quick 15-minute demo would be valuable for you. How does [day] at [time] look?`,
      };

      personalizationBullets = [
        `${contact.firstName || 'This contact'} is a ${title} - likely focused on team efficiency and results`,
        `${companyName} could benefit from [your product's key value prop]`,
        `As a ${title}, they probably care about [relevant outcomes]`,
        `Good opportunity to discuss how similar companies have improved their processes`,
      ];
    }

    // Save to generated content
    await prisma.generatedContent.create({
      data: {
        tenantId,
        userId: request.userId!,
        type: 'CALL_SCRIPT',
        title: `Call brief for ${contact.firstName || 'contact'}`,
        content: JSON.stringify({ callScript, personalizationBullets }),
        sourceType: 'contact',
        sourceId: contact.id,
      },
    });

    return reply.send({
      success: true,
      data: {
        contact: {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          company: contact.company,
        },
        personalization: personalizationBullets,
        openers: [
          callScript.opening,
          // Generate 2 alternative openers
          callScript.opening.replace(/^Hi/, 'Hello').replace(/^Hello/, 'Hey'),
        ].slice(0, 3),
        discoveryQuestions: callScript.discovery,
        pitch: callScript.pitch,
        objectionHandlers: callScript.objectionHandlers,
        closeStatement: callScript.close,
      },
    });
  });

  // ===========================================
  // Get Active Call
  // ===========================================

  fastify.get('/active', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const activeCall = await prisma.meeting.findFirst({
      where: {
        tenantId,
        userId,
        platform: 'OTHER',
        status: 'RECORDING',
      },
      include: {
        participants: {
          include: {
            contact: { include: { company: true } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!activeCall) {
      return reply.send({ success: true, data: null });
    }

    const contact = activeCall.participants[0]?.contact;

    return reply.send({
      success: true,
      data: {
        callId: activeCall.id,
        startedAt: activeCall.startedAt,
        contact: contact ? {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          company: contact.company,
        } : null,
      },
    });
  });

  // ===========================================
  // Get Call History for Contact
  // ===========================================

  fastify.get('/contact/:contactId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { contactId } = request.params as { contactId: string };
    const tenantId = request.tenantId!;

    const calls = await prisma.meeting.findMany({
      where: {
        tenantId,
        platform: 'OTHER',
        participants: { some: { contactId } },
      },
      include: {
        transcript: true,
        insights: { orderBy: { version: 'desc' }, take: 1 },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    return reply.send({
      success: true,
      data: calls.map(c => ({
        id: c.id,
        title: c.title,
        status: c.status,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        duration: c.duration,
        hasTranscript: !!c.transcript,
        summary: c.insights[0]?.summary ?? null,
      })),
    });
  });
};

// ===========================================
// Helper Functions
// ===========================================

function getDefaultTaskTitle(outcome: string, contact: { firstName?: string | null }): string {
  const name = contact.firstName || 'contact';
  switch (outcome) {
    case 'SEND_EMAIL':
      return `Send follow-up email to ${name}`;
    case 'FOLLOW_UP_LATER':
      return `Follow up with ${name}`;
    case 'LEFT_VOICEMAIL':
      return `Follow up on voicemail with ${name}`;
    default:
      return `Follow up with ${name}`;
  }
}

function getDefaultDueDate(outcome: string): Date {
  const now = new Date();
  switch (outcome) {
    case 'SEND_EMAIL':
      return new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
    case 'LEFT_VOICEMAIL':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day
    case 'FOLLOW_UP_LATER':
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day
  }
}

