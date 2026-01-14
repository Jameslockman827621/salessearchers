// ===========================================
// Settings Routes (Complete Implementation)
// ===========================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma, RecordingRuleType } from '@salessearchers/db';
import { AUDIT_ACTIONS, logger, NotFoundError } from '@salessearchers/shared';
import { getEffectivePolicy } from '../lib/recording-policy';

export async function settingsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate);

  // Get recording policy
  app.get('/recording-policy', async (request: FastifyRequest) => {
    await app.requirePermission('settings.read')(request, {} as never);

    const tenantId = request.tenantId!;
    const userId = request.userId!;

    const [orgDefault, userOverride] = await Promise.all([
      prisma.recordingPolicy.findFirst({
        where: { tenantId, isOrgDefault: true },
      }),
      prisma.recordingPolicy.findFirst({
        where: { tenantId, userId },
      }),
    ]);

    const effective = await getEffectivePolicy(tenantId, userId);

    return {
      success: true,
      data: {
        orgDefault: orgDefault
          ? {
              id: orgDefault.id,
              ruleType: orgDefault.ruleType,
              keywords: orgDefault.keywords,
            }
          : null,
        userOverride: userOverride
          ? {
              id: userOverride.id,
              ruleType: userOverride.ruleType,
              keywords: userOverride.keywords,
            }
          : null,
        effective: effective
          ? {
              id: effective.id,
              ruleType: effective.ruleType,
              keywords: effective.keywords,
            }
          : null,
      },
    };
  });

  // Update org recording policy
  app.put('/recording-policy/org', async (request: FastifyRequest) => {
    await app.requirePermission('settings.manage')(request, {} as never);

    const { ruleType, keywords } = request.body as {
      ruleType: RecordingRuleType;
      keywords?: string[];
    };
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Find existing org default
    const existing = await prisma.recordingPolicy.findFirst({
      where: { tenantId, isOrgDefault: true },
    });

    const policy = existing
      ? await prisma.recordingPolicy.update({
          where: { id: existing.id },
          data: { ruleType, keywords: keywords ?? [] },
        })
      : await prisma.recordingPolicy.create({
          data: {
            tenantId,
            ruleType,
            keywords: keywords ?? [],
            isOrgDefault: true,
          },
        });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        resource: 'recording_policy',
        resourceId: policy.id,
        details: { scope: 'org', ruleType, keywords },
      },
    });

    return {
      success: true,
      data: { id: policy.id },
    };
  });

  // Update user recording policy override
  app.put('/recording-policy/user', async (request: FastifyRequest) => {
    await app.requirePermission('settings.read')(request, {} as never);

    const { ruleType, keywords } = request.body as {
      ruleType: RecordingRuleType;
      keywords?: string[];
    };
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Find existing user override
    const existing = await prisma.recordingPolicy.findFirst({
      where: { tenantId, userId },
    });

    const policy = existing
      ? await prisma.recordingPolicy.update({
          where: { id: existing.id },
          data: { ruleType, keywords: keywords ?? [] },
        })
      : await prisma.recordingPolicy.create({
          data: {
            tenantId,
            userId,
            ruleType,
            keywords: keywords ?? [],
            isOrgDefault: false,
          },
        });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        resource: 'recording_policy',
        resourceId: policy.id,
        details: { scope: 'user', ruleType, keywords },
      },
    });

    return {
      success: true,
      data: { id: policy.id },
    };
  });

  // Delete user recording policy (revert to org default)
  app.delete('/recording-policy/user', async (request: FastifyRequest) => {
    await app.requirePermission('settings.read')(request, {} as never);

    const tenantId = request.tenantId!;
    const userId = request.userId!;

    await prisma.recordingPolicy.deleteMany({
      where: { tenantId, userId },
    });

    return {
      success: true,
      data: { message: 'User override removed' },
    };
  });

  // Get feature flags
  app.get('/feature-flags', async (request: FastifyRequest) => {
    await app.requirePermission('settings.read')(request, {} as never);

    const tenantId = request.tenantId!;

    // Hardcoded feature flags for now - in production these would be in DB
    const flags = [
      {
        key: 'meeting_bot',
        name: 'Meeting Bot',
        description: 'Enable meeting recording bot (Recall.ai)',
        enabled: true,
      },
      {
        key: 'ai_insights',
        name: 'AI Insights',
        description: 'Enable AI-generated meeting insights',
        enabled: true,
      },
      {
        key: 'calendar_sync',
        name: 'Calendar Sync',
        description: 'Enable calendar integration',
        enabled: true,
      },
      {
        key: 'email_sequences',
        name: 'Email Sequences',
        description: 'Enable email sequence automation',
        enabled: false,
      },
      {
        key: 'linkedin_outreach',
        name: 'LinkedIn Outreach',
        description: 'Enable LinkedIn automation',
        enabled: false,
      },
      {
        key: 'data_rooms',
        name: 'Data Rooms',
        description: 'Enable shareable data rooms',
        enabled: false,
      },
    ];

    return {
      success: true,
      data: flags,
    };
  });

  // Get pipeline stages
  app.get('/pipeline-stages', async (request: FastifyRequest) => {
    await app.requirePermission('settings.read')(request, {} as never);

    const tenantId = request.tenantId!;

    const stages = await prisma.pipelineStage.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });

    // If no stages exist, return default stages
    if (stages.length === 0) {
      const defaultStages = [
        { name: 'Lead', order: 0, color: '#6366F1', isWon: false, isLost: false },
        { name: 'Qualified', order: 1, color: '#F59E0B', isWon: false, isLost: false },
        { name: 'Proposal', order: 2, color: '#3B82F6', isWon: false, isLost: false },
        { name: 'Negotiation', order: 3, color: '#8B5CF6', isWon: false, isLost: false },
        { name: 'Won', order: 4, color: '#10B981', isWon: true, isLost: false },
        { name: 'Lost', order: 5, color: '#EF4444', isWon: false, isLost: true },
      ];

      // Create default stages
      for (const stage of defaultStages) {
        await prisma.pipelineStage.create({
          data: { ...stage, tenantId },
        });
      }

      const created = await prisma.pipelineStage.findMany({
        where: { tenantId },
        orderBy: { order: 'asc' },
      });

      return {
        success: true,
        data: created,
      };
    }

    return {
      success: true,
      data: stages,
    };
  });

  // Update pipeline stages
  app.put('/pipeline-stages', async (request: FastifyRequest) => {
    await app.requirePermission('settings.manage')(request, {} as never);

    const stages = request.body as Array<{
      id?: string;
      name: string;
      order: number;
      color: string | null;
      isWon: boolean;
      isLost: boolean;
    }>;
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // Delete all existing stages and recreate
    await prisma.pipelineStage.deleteMany({
      where: { tenantId },
    });

    for (const stage of stages) {
      await prisma.pipelineStage.create({
        data: {
          tenantId,
          name: stage.name,
          order: stage.order,
          color: stage.color,
          isWon: stage.isWon,
          isLost: stage.isLost,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        resource: 'pipeline_stages',
        resourceId: tenantId,
        details: { stageCount: stages.length },
      },
    });

    const updated = await prisma.pipelineStage.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      data: updated,
    };
  });

  // Get tenant settings
  app.get('/tenant', async (request: FastifyRequest) => {
    await app.requirePermission('settings.read')(request, {} as never);

    const tenantId = request.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        settings: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant', tenantId);
    }

    return {
      success: true,
      data: tenant,
    };
  });

  // Update tenant settings
  app.patch('/tenant', async (request: FastifyRequest) => {
    await app.requirePermission('settings.manage')(request, {} as never);

    const updates = request.body as {
      name?: string;
      domain?: string;
      settings?: Record<string, unknown>;
    };
    const tenantId = request.tenantId!;
    const userId = request.userId!;

    // If updating settings, merge with existing
    let mergedSettings: object | undefined;
    if (updates.settings) {
      const existingTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const existingSettings = (existingTenant?.settings as Record<string, unknown>) ?? {};
      mergedSettings = { ...existingSettings, ...updates.settings };
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.domain && { domain: updates.domain }),
        ...(mergedSettings && { settings: mergedSettings }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        settings: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        resource: 'tenant',
        resourceId: tenantId,
        details: { updates } as object,
      },
    });

    return {
      success: true,
      data: tenant,
    };
  });
}
