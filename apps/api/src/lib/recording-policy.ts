// ===========================================
// Recording Policy Evaluation
// ===========================================

import { prisma, RecordingRuleType } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

interface CalendarEvent {
  id: string;
  title: string | null;
  attendees: Array<{ email: string; name?: string }>;
  organizerEmail: string | null;
  meetingUrl: string | null;
}

interface RecordingDecision {
  shouldRecord: boolean;
  reason: string;
  ruleType: RecordingRuleType;
}

/**
 * Get the effective recording policy for a user
 */
export async function getEffectivePolicy(tenantId: string, userId: string) {
  // Check for user override first
  const userPolicy = await prisma.recordingPolicy.findFirst({
    where: { tenantId, userId },
  });

  if (userPolicy) {
    return userPolicy;
  }

  // Fall back to org default
  const orgPolicy = await prisma.recordingPolicy.findFirst({
    where: { tenantId, isOrgDefault: true },
  });

  return orgPolicy;
}

/**
 * Get tenant's internal domains (for external detection)
 */
export async function getTenantDomains(tenantId: string): Promise<string[]> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { domain: true, settings: true },
  });

  const domains: string[] = [];

  if (tenant?.domain) {
    domains.push(tenant.domain.toLowerCase());
  }

  // Check for additional domains in settings
  const settings = tenant?.settings as Record<string, unknown> | null;
  if (settings?.internalDomains && Array.isArray(settings.internalDomains)) {
    domains.push(...(settings.internalDomains as string[]).map((d) => d.toLowerCase()));
  }

  return domains;
}

/**
 * Check if an email is external to the tenant
 */
export function isExternalEmail(email: string, internalDomains: string[]): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return true;

  return !internalDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Check if event has external attendees
 */
export function hasExternalAttendees(
  attendees: Array<{ email: string }>,
  organizerEmail: string | null,
  internalDomains: string[]
): boolean {
  return attendees.some((attendee) => {
    // Skip the organizer
    if (organizerEmail && attendee.email.toLowerCase() === organizerEmail.toLowerCase()) {
      return false;
    }
    return isExternalEmail(attendee.email, internalDomains);
  });
}

/**
 * Check if event title/description contains keywords
 */
export function matchesKeywords(
  event: CalendarEvent,
  keywords: string[],
  mode: 'include' | 'exclude'
): boolean {
  if (keywords.length === 0) return mode === 'exclude';

  const searchText = (event.title ?? '').toLowerCase();
  const hasMatch = keywords.some((keyword) =>
    searchText.includes(keyword.toLowerCase())
  );

  return mode === 'include' ? hasMatch : !hasMatch;
}

/**
 * Evaluate whether an event should be recorded
 */
export async function evaluateRecordingPolicy(
  tenantId: string,
  userId: string,
  event: CalendarEvent
): Promise<RecordingDecision> {
  // Must have a meeting URL to record
  if (!event.meetingUrl) {
    return {
      shouldRecord: false,
      reason: 'No meeting URL detected',
      ruleType: 'MANUAL_ONLY',
    };
  }

  const policy = await getEffectivePolicy(tenantId, userId);

  if (!policy) {
    // Default to external only if no policy exists
    const domains = await getTenantDomains(tenantId);
    const hasExternal = hasExternalAttendees(event.attendees, event.organizerEmail, domains);
    
    return {
      shouldRecord: hasExternal,
      reason: hasExternal ? 'External attendees detected (default policy)' : 'Internal meeting only (default policy)',
      ruleType: 'EXTERNAL_ONLY',
    };
  }

  switch (policy.ruleType) {
    case 'ALWAYS':
      return {
        shouldRecord: true,
        reason: 'Always record policy',
        ruleType: 'ALWAYS',
      };

    case 'MANUAL_ONLY':
      return {
        shouldRecord: false,
        reason: 'Manual recording only',
        ruleType: 'MANUAL_ONLY',
      };

    case 'EXTERNAL_ONLY': {
      const domains = await getTenantDomains(tenantId);
      const hasExternal = hasExternalAttendees(event.attendees, event.organizerEmail, domains);
      
      return {
        shouldRecord: hasExternal,
        reason: hasExternal ? 'External attendees detected' : 'Internal meeting only',
        ruleType: 'EXTERNAL_ONLY',
      };
    }

    case 'KEYWORD_INCLUDE': {
      const matches = matchesKeywords(event, policy.keywords, 'include');
      return {
        shouldRecord: matches,
        reason: matches ? 'Matched include keywords' : 'Did not match include keywords',
        ruleType: 'KEYWORD_INCLUDE',
      };
    }

    case 'KEYWORD_EXCLUDE': {
      const matches = matchesKeywords(event, policy.keywords, 'exclude');
      return {
        shouldRecord: matches,
        reason: matches ? 'Did not match exclude keywords' : 'Matched exclude keywords (skipping)',
        ruleType: 'KEYWORD_EXCLUDE',
      };
    }

    default:
      return {
        shouldRecord: false,
        reason: 'Unknown policy type',
        ruleType: 'MANUAL_ONLY',
      };
  }
}

/**
 * Schedule meetings for upcoming calendar events based on policy
 */
export async function scheduleRecordingsForEvents(
  tenantId: string,
  userId: string,
  calendarConnectionId: string
): Promise<{ scheduled: number; skipped: number }> {
  let scheduled = 0;
  let skipped = 0;

  // Get upcoming events that haven't been processed
  const now = new Date();
  const events = await prisma.calendarEvent.findMany({
    where: {
      calendarConnectionId,
      startTime: { gte: now },
      status: 'confirmed',
      meeting: null, // Not already scheduled
    },
    orderBy: { startTime: 'asc' },
    take: 50,
  });

  for (const event of events) {
    const calendarEvent: CalendarEvent = {
      id: event.id,
      title: event.title,
      attendees: (event.attendees as Array<{ email: string; name?: string }>) ?? [],
      organizerEmail: event.organizerEmail,
      meetingUrl: event.meetingUrl,
    };

    const decision = await evaluateRecordingPolicy(tenantId, userId, calendarEvent);

    if (decision.shouldRecord && event.meetingUrl) {
      try {
        // Create meeting record
        const meeting = await prisma.meeting.create({
          data: {
            tenantId,
            userId,
            meetingUrl: event.meetingUrl,
            title: event.title,
            platform: detectPlatformFromUrl(event.meetingUrl),
            scheduledAt: event.startTime,
            status: 'SCHEDULED',
            calendarEventId: event.id,
          },
        });

        logger.info('Scheduled recording for event', {
          eventId: event.id,
          meetingId: meeting.id,
          reason: decision.reason,
        });

        scheduled++;
      } catch (error) {
        logger.error('Failed to schedule recording', { eventId: event.id }, error as Error);
      }
    } else {
      logger.debug('Skipped recording for event', {
        eventId: event.id,
        reason: decision.reason,
      });
      skipped++;
    }
  }

  return { scheduled, skipped };
}

function detectPlatformFromUrl(url: string): 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | 'WEBEX' | 'OTHER' {
  if (url.includes('zoom.us')) return 'ZOOM';
  if (url.includes('meet.google.com')) return 'GOOGLE_MEET';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'TEAMS';
  if (url.includes('webex.com')) return 'WEBEX';
  return 'OTHER';
}

