import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

const log = logger;

export async function sequencesRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // =========================================
  // Sequences CRUD
  // =========================================

  // List sequences
  fastify.get('/', async (request: FastifyRequest) => {
    const query = request.query as {
      status?: string;
      search?: string;
      limit?: number;
      cursor?: string;
    };

    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = { tenantId: request.tenantId };

    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const sequences = await prisma.emailSequence.findMany({
      where,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { steps: true, enrollments: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
    });

    const hasMore = sequences.length > limit;
    const result = hasMore ? sequences.slice(0, -1) : sequences;

    return {
      success: true,
      data: {
        sequences: result,
        nextCursor: hasMore ? result[result.length - 1].id : null,
      },
    };
  });

  // Get single sequence with steps
  fastify.get('/:sequenceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId } = request.params as { sequenceId: string };

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        createdBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    // Calculate stats
    const stats = await prisma.sequenceEnrollment.groupBy({
      by: ['status'],
      where: { sequenceId },
      _count: true,
    });

    const statsMap: Record<string, number> = {};
    for (const s of stats) {
      statsMap[s.status.toLowerCase()] = s._count;
    }

    return {
      success: true,
      data: {
        ...sequence,
        stats: {
          enrolled: Object.values(statsMap).reduce((a, b) => a + b, 0),
          active: statsMap['active'] ?? 0,
          completed: statsMap['completed'] ?? 0,
          replied: statsMap['replied'] ?? 0,
          bounced: statsMap['bounced'] ?? 0,
        },
      },
    };
  });

  // Create sequence
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      name: string;
      description?: string;
      settings?: Record<string, unknown>;
    };

    const sequence = await prisma.emailSequence.create({
      data: {
        tenantId: request.tenantId!,
        name: body.name,
        description: body.description,
        settings: body.settings as object,
        createdById: request.userId!,
      },
    });

    log.info('Created sequence', { sequenceId: sequence.id });

    return reply.code(201).send({ success: true, data: sequence });
  });

  // Update sequence
  fastify.put('/:sequenceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId } = request.params as { sequenceId: string };
    const body = request.body as {
      name?: string;
      description?: string;
      status?: string;
      settings?: Record<string, unknown>;
    };

    const existing = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!existing) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    const sequence = await prisma.emailSequence.update({
      where: { id: sequenceId },
      data: {
        name: body.name,
        description: body.description,
        status: body.status as 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | undefined,
        settings: body.settings as object | undefined,
      },
    });

    log.info('Updated sequence', { sequenceId });

    return { success: true, data: sequence };
  });

  // Delete sequence
  fastify.delete('/:sequenceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId } = request.params as { sequenceId: string };

    const existing = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!existing) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    // Check for active enrollments
    const activeEnrollments = await prisma.sequenceEnrollment.count({
      where: { sequenceId, status: 'ACTIVE' },
    });

    if (activeEnrollments > 0) {
      return reply.code(400).send({ success: false, error: 'Cannot delete sequence with active enrollments' });
    }

    await prisma.emailSequence.delete({ where: { id: sequenceId } });

    log.info('Deleted sequence', { sequenceId });

    return { success: true };
  });

  // Duplicate sequence
  fastify.post('/:sequenceId/duplicate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId } = request.params as { sequenceId: string };

    const original = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
      include: { steps: true },
    });

    if (!original) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    const duplicate = await prisma.emailSequence.create({
      data: {
        tenantId: request.tenantId!,
        name: `${original.name} (Copy)`,
        description: original.description,
        settings: original.settings as object | undefined,
        createdById: request.userId!,
        steps: {
          create: original.steps.map((step) => ({
            stepNumber: step.stepNumber,
            stepType: step.stepType,
            delayDays: step.delayDays,
            delayHours: step.delayHours,
            subject: step.subject,
            bodyHtml: step.bodyHtml,
            bodyText: step.bodyText,
            isEnabled: step.isEnabled,
          })),
        },
      },
      include: { steps: true },
    });

    log.info('Duplicated sequence', { originalId: sequenceId, newId: duplicate.id });

    return reply.code(201).send({ success: true, data: duplicate });
  });

  // =========================================
  // Sequence Steps
  // =========================================

  // Add step to sequence
  fastify.post('/:sequenceId/steps', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId } = request.params as { sequenceId: string };
    const body = request.body as {
      stepNumber?: number;
      stepType: string;
      delayDays?: number;
      delayHours?: number;
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      isEnabled?: boolean;
    };

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    // Get current max step number
    const maxStep = await prisma.sequenceStep.aggregate({
      where: { sequenceId },
      _max: { stepNumber: true },
    });

    const stepNumber = body.stepNumber ?? ((maxStep._max.stepNumber ?? 0) + 1);

    // Shift existing steps if inserting in middle
    if (body.stepNumber) {
      await prisma.sequenceStep.updateMany({
        where: {
          sequenceId,
          stepNumber: { gte: stepNumber },
        },
        data: { stepNumber: { increment: 1 } },
      });
    }

    const step = await prisma.sequenceStep.create({
      data: {
        sequenceId,
        stepNumber,
        stepType: body.stepType as 'EMAIL' | 'TASK' | 'LINKEDIN_VIEW' | 'LINKEDIN_CONNECT' | 'LINKEDIN_MESSAGE' | 'MANUAL_TASK' | 'WAIT',
        delayDays: body.delayDays ?? 0,
        delayHours: body.delayHours ?? 0,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        bodyText: body.bodyText,
        isEnabled: body.isEnabled ?? true,
      },
    });

    log.info('Added step to sequence', { sequenceId, stepId: step.id });

    return reply.code(201).send({ success: true, data: step });
  });

  // Update step
  fastify.put('/:sequenceId/steps/:stepId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId, stepId } = request.params as { sequenceId: string; stepId: string };
    const body = request.body as {
      stepType?: string;
      delayDays?: number;
      delayHours?: number;
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      isEnabled?: boolean;
    };

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    const step = await prisma.sequenceStep.update({
      where: { id: stepId, sequenceId },
      data: {
        stepType: body.stepType as 'EMAIL' | 'TASK' | 'LINKEDIN_VIEW' | 'LINKEDIN_CONNECT' | 'LINKEDIN_MESSAGE' | 'MANUAL_TASK' | 'WAIT' | undefined,
        delayDays: body.delayDays,
        delayHours: body.delayHours,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        bodyText: body.bodyText,
        isEnabled: body.isEnabled,
      },
    });

    log.info('Updated sequence step', { stepId });

    return { success: true, data: step };
  });

  // Delete step
  fastify.delete('/:sequenceId/steps/:stepId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId, stepId } = request.params as { sequenceId: string; stepId: string };

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    const step = await prisma.sequenceStep.findUnique({
      where: { id: stepId },
    });

    if (!step || step.sequenceId !== sequenceId) {
      return reply.code(404).send({ success: false, error: 'Step not found' });
    }

    await prisma.sequenceStep.delete({ where: { id: stepId } });

    // Reorder remaining steps
    await prisma.$executeRaw`
      UPDATE "SequenceStep"
      SET "stepNumber" = "stepNumber" - 1
      WHERE "sequenceId" = ${sequenceId}
      AND "stepNumber" > ${step.stepNumber}
    `;

    log.info('Deleted sequence step', { stepId });

    return { success: true };
  });

  // Reorder steps
  fastify.put('/:sequenceId/steps/reorder', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId } = request.params as { sequenceId: string };
    const { stepIds } = request.body as { stepIds: string[] };

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    // Update each step's order
    for (let i = 0; i < stepIds.length; i++) {
      await prisma.sequenceStep.update({
        where: { id: stepIds[i], sequenceId },
        data: { stepNumber: i + 1 },
      });
    }

    log.info('Reordered sequence steps', { sequenceId });

    return { success: true };
  });

  // =========================================
  // Enrollments
  // =========================================

  // List enrollments for a sequence
  fastify.get('/:sequenceId/enrollments', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId } = request.params as { sequenceId: string };
    const query = request.query as {
      status?: string;
      limit?: number;
      cursor?: string;
    };

    const limit = query.limit ?? 50;

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    const where: Record<string, unknown> = { sequenceId };
    if (query.status) where.status = query.status;

    const enrollments = await prisma.sequenceEnrollment.findMany({
      where,
      include: {
        contact: {
          select: { firstName: true, lastName: true, email: true },
        },
        currentStep: {
          select: { stepNumber: true, subject: true },
        },
        emailConnection: {
          select: { email: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
      take: limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
    });

    const hasMore = enrollments.length > limit;
    const result = hasMore ? enrollments.slice(0, -1) : enrollments;

    return {
      success: true,
      data: {
        enrollments: result,
        nextCursor: hasMore ? result[result.length - 1].id : null,
      },
    };
  });

  // Enroll contact in sequence
  fastify.post('/:sequenceId/enrollments', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId } = request.params as { sequenceId: string };
    const body = request.body as {
      contactId: string;
      emailConnectionId: string;
      startImmediately?: boolean;
      variables?: Record<string, string>;
    };

    const tenantId = request.tenantId!;

    // Validate sequence
    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId },
      include: { steps: { orderBy: { stepNumber: 'asc' }, take: 1 } },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    if (sequence.status !== 'ACTIVE') {
      return reply.code(400).send({ success: false, error: 'Sequence must be active to enroll contacts' });
    }

    if (sequence.steps.length === 0) {
      return reply.code(400).send({ success: false, error: 'Sequence has no steps' });
    }

    // Validate contact
    const contact = await prisma.contact.findFirst({
      where: { id: body.contactId, tenantId },
    });

    if (!contact) {
      return reply.code(404).send({ success: false, error: 'Contact not found' });
    }

    if (!contact.email) {
      return reply.code(400).send({ success: false, error: 'Contact has no email address' });
    }

    if (contact.unsubscribedAt) {
      return reply.code(400).send({ success: false, error: 'Contact has unsubscribed' });
    }

    // Check if already enrolled
    const existing = await prisma.sequenceEnrollment.findUnique({
      where: { sequenceId_contactId: { sequenceId, contactId: body.contactId } },
    });

    if (existing) {
      return reply.code(400).send({ success: false, error: 'Contact already enrolled in this sequence' });
    }

    // Validate email connection
    const connection = await prisma.emailConnection.findFirst({
      where: {
        id: body.emailConnectionId,
        tenantId,
        isActive: true,
      },
    });

    if (!connection) {
      return reply.code(404).send({ success: false, error: 'Email connection not found or inactive' });
    }

    // Create enrollment
    const firstStep = sequence.steps[0];
    const nextScheduledAt = body.startImmediately ? new Date() : null;

    const enrollment = await prisma.sequenceEnrollment.create({
      data: {
        tenantId,
        sequenceId,
        contactId: body.contactId,
        emailConnectionId: body.emailConnectionId,
        currentStepId: firstStep.id,
        currentStepNumber: 1,
        nextScheduledAt,
        variables: body.variables as object | undefined,
      },
      include: { contact: { select: { firstName: true, lastName: true, email: true } } },
    });

    // Record enrollment event
    await prisma.sequenceEvent.create({
      data: {
        enrollmentId: enrollment.id,
        eventType: 'ENROLLED',
        details: { enrolledBy: request.userId } as object,
      },
    });

    // Start workflow if immediate
    if (body.startImmediately) {
      try {
        const { startSequenceEnrollmentWorkflow } = await import('../lib/temporal.js');
        await startSequenceEnrollmentWorkflow({
          enrollmentId: enrollment.id,
          tenantId,
          sequenceId,
        });
      } catch (error) {
        log.error('Failed to start enrollment workflow', { error, enrollmentId: enrollment.id });
      }
    }

    log.info('Enrolled contact in sequence', {
      sequenceId,
      contactId: body.contactId,
      enrollmentId: enrollment.id,
    });

    return reply.code(201).send({ success: true, data: enrollment });
  });

  // Bulk enroll contacts
  fastify.post('/bulk-enroll', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      sequenceId: string;
      contactIds: string[];
      emailConnectionId: string;
      variables?: Record<string, string>;
    };

    const tenantId = request.tenantId!;

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: body.sequenceId, tenantId },
      include: { steps: { orderBy: { stepNumber: 'asc' }, take: 1 } },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    if (sequence.status !== 'ACTIVE') {
      return reply.code(400).send({ success: false, error: 'Sequence must be active' });
    }

    const connection = await prisma.emailConnection.findFirst({
      where: { id: body.emailConnectionId, tenantId, isActive: true },
    });

    if (!connection) {
      return reply.code(404).send({ success: false, error: 'Email connection not found' });
    }

    let enrolled = 0;
    let skipped = 0;
    const errors: Array<{ contactId: string; reason: string }> = [];

    for (const contactId of body.contactIds) {
      try {
        const contact = await prisma.contact.findFirst({
          where: { id: contactId, tenantId },
        });

        if (!contact) {
          errors.push({ contactId, reason: 'Contact not found' });
          continue;
        }

        if (!contact.email) {
          errors.push({ contactId, reason: 'No email address' });
          continue;
        }

        if (contact.unsubscribedAt) {
          errors.push({ contactId, reason: 'Unsubscribed' });
          continue;
        }

        const existing = await prisma.sequenceEnrollment.findUnique({
          where: { sequenceId_contactId: { sequenceId: body.sequenceId, contactId } },
        });

        if (existing) {
          skipped++;
          continue;
        }

        const firstStep = sequence.steps[0];

        const enrollment = await prisma.sequenceEnrollment.create({
          data: {
            tenantId,
            sequenceId: body.sequenceId,
            contactId,
            emailConnectionId: body.emailConnectionId,
            currentStepId: firstStep.id,
            currentStepNumber: 1,
            nextScheduledAt: new Date(),
            variables: body.variables as object | undefined,
          },
        });

        await prisma.sequenceEvent.create({
          data: {
            enrollmentId: enrollment.id,
            eventType: 'ENROLLED',
            details: { enrolledBy: request.userId, bulk: true } as object,
          },
        });

        // Start workflow
        try {
          const { startSequenceEnrollmentWorkflow } = await import('../lib/temporal.js');
          await startSequenceEnrollmentWorkflow({
            enrollmentId: enrollment.id,
            tenantId,
            sequenceId: body.sequenceId,
          });
        } catch (error) {
          log.error('Failed to start enrollment workflow', { error, enrollmentId: enrollment.id });
        }

        enrolled++;
      } catch (error) {
        log.error('Failed to enroll contact', { contactId, error });
        errors.push({ contactId, reason: 'Enrollment failed' });
      }
    }

    log.info('Bulk enrollment completed', { sequenceId: body.sequenceId, enrolled, skipped, errors: errors.length });

    return { success: true, data: { enrolled, skipped, errors } };
  });

  // Pause/Resume enrollment
  fastify.put('/:sequenceId/enrollments/:enrollmentId/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId, enrollmentId } = request.params as { sequenceId: string; enrollmentId: string };
    const { status, reason } = request.body as { status: string; reason?: string };

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    const enrollment = await prisma.sequenceEnrollment.findFirst({
      where: { id: enrollmentId, sequenceId },
    });

    if (!enrollment) {
      return reply.code(404).send({ success: false, error: 'Enrollment not found' });
    }

    const updateData: Record<string, unknown> = { status };

    if (status === 'PAUSED') {
      updateData.pausedAt = new Date();
      updateData.pauseReason = reason;
    } else if (status === 'ACTIVE' && enrollment.status === 'PAUSED') {
      updateData.pausedAt = null;
      updateData.pauseReason = null;
      updateData.nextScheduledAt = new Date(); // Resume immediately
    } else if (status === 'CANCELLED') {
      updateData.completedAt = new Date();
    }

    await prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: updateData,
    });

    const eventType = status === 'PAUSED' ? 'PAUSED' : status === 'ACTIVE' ? 'RESUMED' : 'CANCELLED';

    await prisma.sequenceEvent.create({
      data: {
        enrollmentId,
        eventType,
        details: { by: request.userId, reason } as object,
      },
    });

    // If resuming, restart workflow
    if (status === 'ACTIVE' && enrollment.status === 'PAUSED') {
      try {
        const { startSequenceEnrollmentWorkflow } = await import('../lib/temporal.js');
        await startSequenceEnrollmentWorkflow({
          enrollmentId,
          tenantId: request.tenantId!,
          sequenceId,
        });
      } catch (error) {
        log.error('Failed to restart enrollment workflow', { error, enrollmentId });
      }
    }

    log.info('Updated enrollment status', { enrollmentId, status });

    return { success: true };
  });

  // Get enrollment activity/events
  fastify.get('/:sequenceId/enrollments/:enrollmentId/events', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sequenceId, enrollmentId } = request.params as { sequenceId: string; enrollmentId: string };
    const { limit } = request.query as { limit?: number };

    const sequence = await prisma.emailSequence.findFirst({
      where: { id: sequenceId, tenantId: request.tenantId },
    });

    if (!sequence) {
      return reply.code(404).send({ success: false, error: 'Sequence not found' });
    }

    const events = await prisma.sequenceEvent.findMany({
      where: { enrollmentId },
      orderBy: { createdAt: 'desc' },
      take: limit ?? 50,
    });

    return { success: true, data: { events } };
  });
}
