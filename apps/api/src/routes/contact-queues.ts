// ===========================================
// Smart Contact Queues API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Types & Interfaces
// ===========================================

interface QueueDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  priority: number; // Display order
}

interface ContactWithPriority {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  timezone: string | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  lastContactedAt: Date | null;
  lastRepliedAt: Date | null;
  nextActionAt: Date | null;
  callPriority: number;
  status: string;
  company: { id: string; name: string; domain: string | null } | null;
  leadScore: { totalScore: number; grade: string | null } | null;
  // Computed fields
  localTime: string | null;
  isCallableNow: boolean;
  nextBestAction: NextBestAction;
  priorityScore: number;
  overdueTaskCount: number;
  dueTodayTaskCount: number;
}

interface NextBestAction {
  type: 'CALL' | 'EMAIL' | 'LINKEDIN' | 'ENRICH_PHONE' | 'ENRICH_EMAIL' | 'FOLLOW_UP' | 'WAIT';
  label: string;
  reason: string;
  urgent: boolean;
}

// ===========================================
// Queue Definitions
// ===========================================

const QUEUE_DEFINITIONS: QueueDefinition[] = [
  {
    key: 'call_now',
    name: 'Call Now',
    description: 'Contacts ready to call right now (in their business hours)',
    icon: 'phone',
    color: '#22c55e',
    priority: 1,
  },
  {
    key: 'follow_ups_due',
    name: 'Follow-ups Due',
    description: 'Tasks overdue or due today',
    icon: 'clock',
    color: '#f59e0b',
    priority: 2,
  },
  {
    key: 'hot_leads',
    name: 'Hot Leads',
    description: 'High-scoring leads (Grade A & B)',
    icon: 'flame',
    color: '#ef4444',
    priority: 3,
  },
  {
    key: 'call_later',
    name: 'Call Later (Timezone)',
    description: 'Good leads but outside their business hours',
    icon: 'globe',
    color: '#6366f1',
    priority: 4,
  },
  {
    key: 'needs_phone',
    name: 'Needs Phone',
    description: 'Missing phone number - enrich to call',
    icon: 'search',
    color: '#8b5cf6',
    priority: 5,
  },
  {
    key: 'needs_email',
    name: 'Needs Email',
    description: 'Missing email address - enrich to reach',
    icon: 'mail',
    color: '#06b6d4',
    priority: 6,
  },
  {
    key: 'linkedin_ready',
    name: 'LinkedIn Ready',
    description: 'Has LinkedIn profile, ready for outreach',
    icon: 'linkedin',
    color: '#0077b5',
    priority: 7,
  },
  {
    key: 'recently_contacted',
    name: 'Recently Contacted',
    description: 'Contacted in the last 7 days',
    icon: 'check',
    color: '#64748b',
    priority: 8,
  },
];

// ===========================================
// Timezone Utilities
// ===========================================

// Common timezone offsets (simplified - in production use a library)
const TIMEZONE_OFFSETS: Record<string, number> = {
  'America/Los_Angeles': -8,
  'America/Denver': -7,
  'America/Chicago': -6,
  'America/New_York': -5,
  'America/Sao_Paulo': -3,
  'Europe/London': 0,
  'Europe/Paris': 1,
  'Europe/Berlin': 1,
  'Europe/Moscow': 3,
  'Asia/Dubai': 4,
  'Asia/Kolkata': 5.5,
  'Asia/Singapore': 8,
  'Asia/Tokyo': 9,
  'Asia/Shanghai': 8,
  'Australia/Sydney': 11,
  'Pacific/Auckland': 13,
  // Fallback to GMT offset patterns
  'GMT': 0,
  'UTC': 0,
  'EST': -5,
  'CST': -6,
  'MST': -7,
  'PST': -8,
  'CET': 1,
  'IST': 5.5,
};

function getTimezoneOffset(timezone: string | null): number | null {
  if (!timezone) return null;
  
  // Try direct match
  if (TIMEZONE_OFFSETS[timezone] !== undefined) {
    return TIMEZONE_OFFSETS[timezone];
  }
  
  // Try to parse GMT+X or UTC+X format
  const gmtMatch = timezone.match(/^(GMT|UTC)([+-])(\d{1,2}):?(\d{2})?$/i);
  if (gmtMatch) {
    const sign = gmtMatch[2] === '+' ? 1 : -1;
    const hours = parseInt(gmtMatch[3], 10);
    const minutes = gmtMatch[4] ? parseInt(gmtMatch[4], 10) / 60 : 0;
    return sign * (hours + minutes);
  }
  
  return null;
}

function getContactLocalTime(timezone: string | null): { time: string; hour: number } | null {
  const offset = getTimezoneOffset(timezone);
  if (offset === null) return null;
  
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const localTime = new Date(utc + offset * 3600000);
  
  const hour = localTime.getHours();
  const minutes = localTime.getMinutes();
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  
  return {
    time: `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`,
    hour,
  };
}

function isWithinCallHours(timezone: string | null, startHour = 9, endHour = 18): boolean {
  const localTime = getContactLocalTime(timezone);
  if (!localTime) return true; // If unknown timezone, assume callable
  
  const { hour } = localTime;
  const dayOfWeek = new Date().getDay();
  
  // Weekday check (Mon-Fri = 1-5)
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  
  return hour >= startHour && hour < endHour;
}

// ===========================================
// Priority Calculation
// ===========================================

interface PriorityFactors {
  leadScore: number | null;
  hasOverdueTask: boolean;
  hasDueTodayTask: boolean;
  daysSinceLastContact: number | null;
  daysSinceLastReply: number | null;
  hasPhone: boolean;
  hasEmail: boolean;
  isCallableNow: boolean;
  status: string;
}

function calculatePriorityScore(factors: PriorityFactors): number {
  let score = 500; // Base score
  
  // Lead score contribution (0-300 points)
  if (factors.leadScore !== null) {
    score += Math.min(factors.leadScore * 3, 300);
  }
  
  // Task urgency (0-200 points)
  if (factors.hasOverdueTask) {
    score += 200;
  } else if (factors.hasDueTodayTask) {
    score += 100;
  }
  
  // Recency bonus/penalty
  if (factors.daysSinceLastReply !== null) {
    if (factors.daysSinceLastReply < 1) {
      score += 150; // Very recent engagement
    } else if (factors.daysSinceLastReply < 3) {
      score += 100;
    } else if (factors.daysSinceLastReply < 7) {
      score += 50;
    }
  }
  
  // Contact freshness penalty
  if (factors.daysSinceLastContact !== null) {
    if (factors.daysSinceLastContact < 1) {
      score -= 100; // Recently contacted, let them breathe
    } else if (factors.daysSinceLastContact < 3) {
      score -= 50;
    }
  }
  
  // Callable bonus
  if (factors.isCallableNow && factors.hasPhone) {
    score += 100;
  }
  
  // Data completeness
  if (!factors.hasPhone) score -= 50;
  if (!factors.hasEmail) score -= 30;
  
  // Status modifiers
  if (factors.status === 'QUALIFIED') score += 50;
  if (factors.status === 'NURTURING') score -= 25;
  if (factors.status === 'DO_NOT_CONTACT') score = 0;
  
  return Math.max(0, Math.min(1000, score));
}

function determineNextBestAction(
  contact: {
    phone: string | null;
    email: string | null;
    linkedinUrl: string | null;
    doNotCall: boolean;
    doNotEmail: boolean;
    lastContactedAt: Date | null;
  },
  isCallableNow: boolean,
  hasOverdueTask: boolean,
  hasDueTodayTask: boolean,
  leadScore: number | null
): NextBestAction {
  // Priority 1: Overdue follow-ups
  if (hasOverdueTask) {
    return {
      type: 'FOLLOW_UP',
      label: 'Follow Up',
      reason: 'Overdue task needs attention',
      urgent: true,
    };
  }
  
  // Priority 2: Due today
  if (hasDueTodayTask) {
    return {
      type: 'FOLLOW_UP',
      label: 'Follow Up',
      reason: 'Task due today',
      urgent: false,
    };
  }
  
  // Priority 3: Call if callable
  if (contact.phone && !contact.doNotCall && isCallableNow) {
    const isHot = leadScore !== null && leadScore >= 60;
    return {
      type: 'CALL',
      label: 'Call Now',
      reason: isHot ? 'Hot lead in business hours' : 'In business hours',
      urgent: isHot,
    };
  }
  
  // Priority 4: Enrich if missing data
  if (!contact.phone && !contact.doNotCall) {
    return {
      type: 'ENRICH_PHONE',
      label: 'Find Phone',
      reason: 'Missing phone number',
      urgent: false,
    };
  }
  
  if (!contact.email && !contact.doNotEmail) {
    return {
      type: 'ENRICH_EMAIL',
      label: 'Find Email',
      reason: 'Missing email address',
      urgent: false,
    };
  }
  
  // Priority 5: Email if has email
  if (contact.email && !contact.doNotEmail) {
    return {
      type: 'EMAIL',
      label: 'Send Email',
      reason: 'Email available',
      urgent: false,
    };
  }
  
  // Priority 6: LinkedIn if available
  if (contact.linkedinUrl) {
    return {
      type: 'LINKEDIN',
      label: 'LinkedIn',
      reason: 'LinkedIn profile available',
      urgent: false,
    };
  }
  
  // Default: Wait
  return {
    type: 'WAIT',
    label: 'No Action',
    reason: 'No available channel',
    urgent: false,
  };
}

// ===========================================
// Schemas
// ===========================================

const getQueueSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
});

// ===========================================
// Routes
// ===========================================

export const contactQueuesRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // Get All Queue Definitions with Counts
  // ===========================================

  fastify.get('/queues', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get counts for each queue in parallel
    const [
      totalContacts,
      contactsWithPhone,
      contactsWithoutPhone,
      contactsWithoutEmail,
      contactsWithLinkedIn,
      overdueTaskContacts,
      dueTodayTaskContacts,
      hotLeads,
      recentlyContacted,
    ] = await Promise.all([
      // Total active contacts
      prisma.contact.count({
        where: { tenantId, status: { not: 'DO_NOT_CONTACT' } },
      }),
      
      // Contacts with phone (potential call_now + call_later)
      prisma.contact.count({
        where: {
          tenantId,
          phone: { not: null },
          doNotCall: false,
          status: { not: 'DO_NOT_CONTACT' },
        },
      }),
      
      // Needs phone
      prisma.contact.count({
        where: {
          tenantId,
          phone: null,
          doNotCall: false,
          status: { not: 'DO_NOT_CONTACT' },
        },
      }),
      
      // Needs email
      prisma.contact.count({
        where: {
          tenantId,
          email: null,
          doNotEmail: false,
          status: { not: 'DO_NOT_CONTACT' },
        },
      }),
      
      // LinkedIn ready
      prisma.contact.count({
        where: {
          tenantId,
          linkedinUrl: { not: null },
          status: { not: 'DO_NOT_CONTACT' },
        },
      }),
      
      // Overdue tasks (distinct contacts)
      prisma.task.groupBy({
        by: ['contactId'],
        where: {
          tenantId,
          contactId: { not: null },
          status: { not: 'COMPLETED' },
          dueAt: { lt: todayStart },
        },
      }).then(r => r.length),
      
      // Due today tasks (distinct contacts)
      prisma.task.groupBy({
        by: ['contactId'],
        where: {
          tenantId,
          contactId: { not: null },
          status: { not: 'COMPLETED' },
          dueAt: { gte: todayStart, lt: todayEnd },
        },
      }).then(r => r.length),
      
      // Hot leads (A or B grade)
      prisma.leadScore.count({
        where: {
          tenantId,
          grade: { in: ['A', 'B'] },
        },
      }),
      
      // Recently contacted
      prisma.contact.count({
        where: {
          tenantId,
          lastContactedAt: { gte: sevenDaysAgo },
          status: { not: 'DO_NOT_CONTACT' },
        },
      }),
    ]);

    // Build queue response with counts
    const queues = QUEUE_DEFINITIONS.map(q => {
      let count = 0;
      switch (q.key) {
        case 'call_now':
          // Estimate: contacts with phone * ~40% (assume 40% are in call hours)
          count = Math.floor(contactsWithPhone * 0.4);
          break;
        case 'follow_ups_due':
          count = overdueTaskContacts + dueTodayTaskContacts;
          break;
        case 'hot_leads':
          count = hotLeads;
          break;
        case 'call_later':
          // Contacts with phone minus those callable now
          count = Math.floor(contactsWithPhone * 0.6);
          break;
        case 'needs_phone':
          count = contactsWithoutPhone;
          break;
        case 'needs_email':
          count = contactsWithoutEmail;
          break;
        case 'linkedin_ready':
          count = contactsWithLinkedIn;
          break;
        case 'recently_contacted':
          count = recentlyContacted;
          break;
      }
      return { ...q, count };
    });

    return reply.send({
      success: true,
      data: {
        queues,
        totalContacts,
      },
    });
  });

  // ===========================================
  // Get Contacts for a Specific Queue
  // ===========================================

  fastify.get<{ Params: { queueKey: string } }>('/queues/:queueKey', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { queueKey } = request.params;
    const query = getQueueSchema.parse(request.query);
    const tenantId = request.tenantId!;

    const queueDef = QUEUE_DEFINITIONS.find(q => q.key === queueKey);
    if (!queueDef) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Queue not found' },
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Build where clause based on queue
    let where: Prisma.ContactWhereInput = {
      tenantId,
      status: { not: 'DO_NOT_CONTACT' },
    };

    // Add search filter
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { company: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    // Add cursor for pagination
    if (query.cursor) {
      where.id = { lt: query.cursor };
    }

    // Queue-specific filters
    switch (queueKey) {
      case 'call_now':
      case 'call_later':
        where.phone = { not: null };
        where.doNotCall = false;
        break;
      case 'follow_ups_due':
        // Get contacts with overdue or due today tasks
        const taskContactIds = await prisma.task.findMany({
          where: {
            tenantId,
            contactId: { not: null },
            status: { not: 'COMPLETED' },
            dueAt: { lt: todayEnd },
          },
          select: { contactId: true },
          distinct: ['contactId'],
        });
        where.id = { in: taskContactIds.map(t => t.contactId!).filter(Boolean) };
        break;
      case 'hot_leads':
        const hotLeadContactIds = await prisma.leadScore.findMany({
          where: { tenantId, grade: { in: ['A', 'B'] } },
          select: { contactId: true },
        });
        where.id = { in: hotLeadContactIds.map(l => l.contactId) };
        break;
      case 'needs_phone':
        where.phone = null;
        where.doNotCall = false;
        break;
      case 'needs_email':
        where.email = null;
        where.doNotEmail = false;
        break;
      case 'linkedin_ready':
        where.linkedinUrl = { not: null };
        break;
      case 'recently_contacted':
        where.lastContactedAt = { gte: sevenDaysAgo };
        break;
    }

    // Fetch contacts
    const contacts = await prisma.contact.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, domain: true } },
        leadScore: { select: { totalScore: true, grade: true } },
        tasks: {
          where: {
            status: { not: 'COMPLETED' },
            dueAt: { not: null },
          },
          select: { id: true, dueAt: true, title: true },
          orderBy: { dueAt: 'asc' },
          take: 3,
        },
      },
      orderBy: [
        { callPriority: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: query.limit + 1, // Fetch one extra to determine if there's more
    });

    // Check if there are more results
    const hasMore = contacts.length > query.limit;
    const contactsToReturn = hasMore ? contacts.slice(0, -1) : contacts;

    // Enrich contacts with computed fields
    const enrichedContacts: ContactWithPriority[] = contactsToReturn.map(contact => {
      const localTimeInfo = getContactLocalTime(contact.timezone);
      const isCallableNow = contact.phone && !contact.doNotCall && isWithinCallHours(contact.timezone);
      
      // Calculate task stats
      const overdueTaskCount = contact.tasks.filter(t => t.dueAt && t.dueAt < todayStart).length;
      const dueTodayTaskCount = contact.tasks.filter(t => t.dueAt && t.dueAt >= todayStart && t.dueAt < todayEnd).length;
      
      // Calculate days since contact
      const daysSinceLastContact = contact.lastContactedAt
        ? Math.floor((now.getTime() - contact.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      const daysSinceLastReply = contact.lastRepliedAt
        ? Math.floor((now.getTime() - contact.lastRepliedAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      // Calculate priority
      const priorityScore = calculatePriorityScore({
        leadScore: contact.leadScore?.totalScore ?? null,
        hasOverdueTask: overdueTaskCount > 0,
        hasDueTodayTask: dueTodayTaskCount > 0,
        daysSinceLastContact,
        daysSinceLastReply,
        hasPhone: !!contact.phone,
        hasEmail: !!contact.email,
        isCallableNow: !!isCallableNow,
        status: contact.status,
      });

      // Determine next best action
      const nextBestAction = determineNextBestAction(
        contact,
        !!isCallableNow,
        overdueTaskCount > 0,
        dueTodayTaskCount > 0,
        contact.leadScore?.totalScore ?? null
      );

      // Filter out for call_now vs call_later
      // We'll do this after enrichment

      return {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        title: contact.title,
        timezone: contact.timezone,
        linkedinUrl: contact.linkedinUrl,
        avatarUrl: contact.avatarUrl,
        lastContactedAt: contact.lastContactedAt,
        lastRepliedAt: contact.lastRepliedAt,
        nextActionAt: contact.nextActionAt,
        callPriority: contact.callPriority,
        status: contact.status,
        company: contact.company,
        leadScore: contact.leadScore,
        localTime: localTimeInfo?.time ?? null,
        isCallableNow: !!isCallableNow,
        nextBestAction,
        priorityScore,
        overdueTaskCount,
        dueTodayTaskCount,
      };
    });

    // Filter for call_now/call_later queues
    let filteredContacts = enrichedContacts;
    if (queueKey === 'call_now') {
      filteredContacts = enrichedContacts.filter(c => c.isCallableNow);
    } else if (queueKey === 'call_later') {
      filteredContacts = enrichedContacts.filter(c => !c.isCallableNow);
    }

    // Sort by priority score
    filteredContacts.sort((a, b) => b.priorityScore - a.priorityScore);

    // Get next cursor
    const nextCursor = hasMore && filteredContacts.length > 0
      ? filteredContacts[filteredContacts.length - 1].id
      : null;

    return reply.send({
      success: true,
      data: {
        queue: queueDef,
        contacts: filteredContacts,
        nextCursor,
        hasMore,
      },
    });
  });

  // ===========================================
  // Quick Search Contacts (for search-first UX)
  // ===========================================

  fastify.get('/search', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const querySchema = z.object({
      q: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    });
    const query = querySchema.parse(request.query);
    const tenantId = request.tenantId!;

    const contacts = await prisma.contact.findMany({
      where: {
        tenantId,
        status: { not: 'DO_NOT_CONTACT' },
        OR: [
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q } },
          { company: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      },
      include: {
        company: { select: { id: true, name: true, domain: true } },
        leadScore: { select: { totalScore: true, grade: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: query.limit,
    });

    // Enrich with basic computed fields
    const enrichedContacts = contacts.map(contact => {
      const localTimeInfo = getContactLocalTime(contact.timezone);
      const isCallableNow = contact.phone && !contact.doNotCall && isWithinCallHours(contact.timezone);
      
      return {
        ...contact,
        localTime: localTimeInfo?.time ?? null,
        isCallableNow: !!isCallableNow,
      };
    });

    return reply.send({
      success: true,
      data: enrichedContacts,
    });
  });

  // ===========================================
  // Update Contact Priority (recalculate)
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/recalculate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const contact = await prisma.contact.findFirst({
      where: { id, tenantId },
      include: {
        leadScore: true,
        tasks: {
          where: { status: { not: 'COMPLETED' } },
        },
      },
    });

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate priority
    const isCallableNow = contact.phone && !contact.doNotCall && isWithinCallHours(contact.timezone);
    const daysSinceLastContact = contact.lastContactedAt
      ? Math.floor((now.getTime() - contact.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const daysSinceLastReply = contact.lastRepliedAt
      ? Math.floor((now.getTime() - contact.lastRepliedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const hasOverdueTask = contact.tasks.some(t => t.dueAt && t.dueAt < todayStart);
    const hasDueTodayTask = contact.tasks.some(t => {
      if (!t.dueAt) return false;
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      return t.dueAt >= todayStart && t.dueAt < todayEnd;
    });

    const priorityScore = calculatePriorityScore({
      leadScore: contact.leadScore?.totalScore ?? null,
      hasOverdueTask,
      hasDueTodayTask,
      daysSinceLastContact,
      daysSinceLastReply,
      hasPhone: !!contact.phone,
      hasEmail: !!contact.email,
      isCallableNow: !!isCallableNow,
      status: contact.status,
    });

    await prisma.contact.update({
      where: { id },
      data: { callPriority: priorityScore },
    });

    logger.info('Contact priority recalculated', { context: 'contact-queues', contactId: id, priority: priorityScore });

    return reply.send({
      success: true,
      data: { callPriority: priorityScore },
    });
  });

  // ===========================================
  // Mark Contact as Contacted
  // ===========================================

  fastify.post<{ Params: { id: string } }>('/:id/mark-contacted', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const bodySchema = z.object({
      channel: z.enum(['CALL', 'EMAIL', 'LINKEDIN', 'OTHER']).default('CALL'),
      outcome: z.string().optional(),
      nextActionAt: z.string().datetime().optional(),
    });
    const body = bodySchema.parse(request.body ?? {});

    const contact = await prisma.contact.findFirst({
      where: { id, tenantId },
    });

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contact not found' },
      });
    }

    const updateData: Prisma.ContactUpdateInput = {
      lastContactedAt: new Date(),
    };

    if (body.nextActionAt) {
      updateData.nextActionAt = new Date(body.nextActionAt);
    }

    await prisma.contact.update({
      where: { id },
      data: updateData,
    });

    // Log activity
    await prisma.activity.create({
      data: {
        tenantId,
        userId: request.userId!,
        contactId: id,
        type: `contact_${body.channel.toLowerCase()}`,
        title: `Contacted via ${body.channel}`,
        description: body.outcome || `Contact was reached via ${body.channel}`,
      },
    });

    return reply.send({
      success: true,
      data: { message: 'Contact marked as contacted' },
    });
  });

  // ===========================================
  // Start Call Block (batch call preparation)
  // ===========================================

  fastify.post('/start-call-block', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const bodySchema = z.object({
      queueKey: z.string().optional(),
      contactIds: z.array(z.string().uuid()).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    });
    const body = bodySchema.parse(request.body ?? {});
    const tenantId = request.tenantId!;

    let contactIds: string[] = [];

    if (body.contactIds && body.contactIds.length > 0) {
      // Use provided contact IDs
      contactIds = body.contactIds;
    } else if (body.queueKey) {
      // Get top contacts from queue
      const queueKey = body.queueKey;
      
      let where: Prisma.ContactWhereInput = {
        tenantId,
        status: { not: 'DO_NOT_CONTACT' },
        phone: { not: null },
        doNotCall: false,
      };

      const contacts = await prisma.contact.findMany({
        where,
        select: { id: true, timezone: true },
        orderBy: { callPriority: 'desc' },
        take: body.limit * 2, // Get more to filter by callable
      });

      // Filter by callable now
      const callableContacts = contacts.filter(c => isWithinCallHours(c.timezone));
      contactIds = callableContacts.slice(0, body.limit).map(c => c.id);
    } else {
      // Default: get top callable contacts
      const contacts = await prisma.contact.findMany({
        where: {
          tenantId,
          status: { not: 'DO_NOT_CONTACT' },
          phone: { not: null },
          doNotCall: false,
        },
        select: { id: true, timezone: true },
        orderBy: { callPriority: 'desc' },
        take: body.limit * 2,
      });

      const callableContacts = contacts.filter(c => isWithinCallHours(c.timezone));
      contactIds = callableContacts.slice(0, body.limit).map(c => c.id);
    }

    return reply.send({
      success: true,
      data: {
        contactIds,
        count: contactIds.length,
      },
    });
  });
};

