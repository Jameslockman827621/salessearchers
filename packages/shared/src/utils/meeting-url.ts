// ===========================================
// Meeting URL Parser
// ===========================================

type MeetingPlatform = 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS' | 'WEBEX' | 'OTHER';

interface ParsedMeetingUrl {
  platform: MeetingPlatform;
  url: string;
  meetingId?: string;
  password?: string;
}

const platformPatterns: Array<{
  platform: MeetingPlatform;
  pattern: RegExp;
  extractId?: (match: RegExpMatchArray) => string;
}> = [
  {
    platform: 'ZOOM',
    pattern: /https?:\/\/(?:[\w-]+\.)?zoom\.us\/j\/(\d+)/i,
    extractId: (match) => match[1],
  },
  {
    platform: 'GOOGLE_MEET',
    pattern: /https?:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i,
    extractId: (match) => match[1],
  },
  {
    platform: 'TEAMS',
    pattern: /https?:\/\/teams\.(microsoft\.com|live\.com)\/l\/meetup-join/i,
  },
  {
    platform: 'WEBEX',
    pattern: /https?:\/\/[\w-]+\.webex\.com/i,
  },
];

/**
 * Parse a meeting URL to extract platform and meeting info
 */
export function parseMeetingUrl(url: string): ParsedMeetingUrl | null {
  if (!url) return null;

  for (const { platform, pattern, extractId } of platformPatterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        platform,
        url,
        meetingId: extractId ? extractId(match) : undefined,
      };
    }
  }

  // Check if it's a valid URL but unknown platform
  try {
    new URL(url);
    return {
      platform: 'OTHER',
      url,
    };
  } catch {
    return null;
  }
}

/**
 * Extract meeting URL from text (description, calendar event, etc.)
 */
export function extractMeetingUrl(text: string): string | null {
  if (!text) return null;

  // Common meeting URL patterns
  const urlPatterns = [
    /https?:\/\/(?:[\w-]+\.)?zoom\.us\/j\/[\w-]+(?:\?[\w=&-]+)?/gi,
    /https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/gi,
    /https?:\/\/teams\.(microsoft\.com|live\.com)\/l\/meetup-join\/[^\s<>"]+/gi,
    /https?:\/\/[\w-]+\.webex\.com\/[\w-]+\/j\.php[^\s<>"]+/gi,
  ];

  for (const pattern of urlPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Check if URL is a supported meeting platform
 */
export function isSupportedMeetingUrl(url: string): boolean {
  const parsed = parseMeetingUrl(url);
  return parsed !== null && parsed.platform !== 'OTHER';
}
