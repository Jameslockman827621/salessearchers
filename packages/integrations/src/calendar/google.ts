// ===========================================
// Google Calendar Integration
// ===========================================

import type { CalendarEvent, CalendarProvider, OAuthTokens } from './types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function createGoogleCalendarProvider(): CalendarProvider {
  return {
    getAuthUrl(state: string, redirectUri: string): string {
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
      });

      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },

    async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google OAuth error: ${error}`);
      }

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scopes: data.scope.split(' '),
      };
    },

    async refreshToken(refreshToken: string): Promise<OAuthTokens> {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh Google token');
      }

      const data = await response.json() as {
        access_token: string;
        expires_in: number;
        scope: string;
      };

      return {
        accessToken: data.access_token,
        refreshToken: null, // Google doesn't return a new refresh token
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scopes: data.scope.split(' '),
      };
    },

    async listEvents(
      accessToken: string,
      options: {
        timeMin?: Date;
        timeMax?: Date;
        syncToken?: string;
      }
    ): Promise<{ events: CalendarEvent[]; nextSyncCursor: string | null }> {
      const params = new URLSearchParams({
        maxResults: '100',
        singleEvents: 'true',
        orderBy: 'startTime',
      });

      if (options.syncToken) {
        params.set('syncToken', options.syncToken);
      } else {
        if (options.timeMin) {
          params.set('timeMin', options.timeMin.toISOString());
        }
        if (options.timeMax) {
          params.set('timeMax', options.timeMax.toISOString());
        }
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        if (response.status === 410) {
          // Sync token invalid, need full sync
          throw new Error('SYNC_TOKEN_INVALID');
        }
        throw new Error(`Google Calendar API error: ${response.status}`);
      }

      const data = await response.json() as {
        items: Array<{
          id: string;
          summary?: string;
          description?: string;
          start: { dateTime?: string; date?: string };
          end: { dateTime?: string; date?: string };
          attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
          organizer?: { email: string };
          conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
          status: string;
          htmlLink: string;
        }>;
        nextSyncToken?: string;
        nextPageToken?: string;
      };

      const events: CalendarEvent[] = data.items.map((item) => {
        // Extract meeting URL from conference data
        let meetingUrl: string | null = null;
        const videoEntry = item.conferenceData?.entryPoints?.find(
          (e) => e.entryPointType === 'video'
        );
        if (videoEntry?.uri) {
          meetingUrl = videoEntry.uri;
        }

        // Check description for meeting URLs if not found in conference data
        if (!meetingUrl && item.description) {
          const urlMatch = item.description.match(
            /(https:\/\/(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)[^\s<>"]+)/i
          );
          if (urlMatch) {
            meetingUrl = urlMatch[1];
          }
        }

        const isAllDay = !item.start.dateTime;
        const startTime = item.start.dateTime
          ? new Date(item.start.dateTime)
          : new Date(item.start.date + 'T00:00:00');
        const endTime = item.end.dateTime
          ? new Date(item.end.dateTime)
          : new Date(item.end.date + 'T23:59:59');

        return {
          id: item.id,
          title: item.summary ?? null,
          description: item.description ?? null,
          startTime,
          endTime,
          isAllDay,
          attendees: (item.attendees ?? []).map((a) => ({
            email: a.email,
            name: a.displayName,
            responseStatus: a.responseStatus,
          })),
          organizerEmail: item.organizer?.email ?? null,
          meetingUrl,
          status: item.status === 'cancelled' ? 'cancelled' : 'confirmed',
        };
      });

      return {
        events,
        nextSyncCursor: data.nextSyncToken ?? null,
      };
    },

    async revokeToken(accessToken: string): Promise<void> {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
        method: 'POST',
      });
    },
  };
}
