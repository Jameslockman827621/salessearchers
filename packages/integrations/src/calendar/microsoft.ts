// ===========================================
// Microsoft Calendar Integration
// ===========================================

import type { CalendarEvent, CalendarProvider, OAuthTokens } from './types';

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? '';
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? '';
const SCOPES = [
  'User.Read',
  'Calendars.Read',
  'offline_access',
];

export function createMicrosoftCalendarProvider(): CalendarProvider {
  return {
    getAuthUrl(state: string, redirectUri: string): string {
      const params = new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        response_mode: 'query',
        state,
      });

      return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    },

    async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
      const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Microsoft OAuth error: ${error}`);
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
      const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh Microsoft token');
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

    async listEvents(
      accessToken: string,
      options: {
        timeMin?: Date;
        timeMax?: Date;
        deltaLink?: string;
      }
    ): Promise<{ events: CalendarEvent[]; nextSyncCursor: string | null }> {
      let url: string;

      if (options.deltaLink) {
        url = options.deltaLink;
      } else {
        const params = new URLSearchParams({
          $top: '100',
          $orderby: 'start/dateTime',
          $select: 'id,subject,bodyPreview,start,end,attendees,organizer,onlineMeeting,webLink,isCancelled,isAllDay',
        });

        if (options.timeMin) {
          params.set('startDateTime', options.timeMin.toISOString());
        }
        if (options.timeMax) {
          params.set('endDateTime', options.timeMax.toISOString());
        }

        url = `https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Microsoft Graph API error: ${response.status}`);
      }

      const data = await response.json() as {
        value: Array<{
          id: string;
          subject?: string;
          bodyPreview?: string;
          start: { dateTime: string; timeZone: string };
          end: { dateTime: string; timeZone: string };
          attendees?: Array<{
            emailAddress: { address: string; name?: string };
            status?: { response?: string };
          }>;
          organizer?: { emailAddress: { address: string } };
          onlineMeeting?: { joinUrl: string };
          isAllDay?: boolean;
          isCancelled?: boolean;
        }>;
        '@odata.deltaLink'?: string;
        '@odata.nextLink'?: string;
      };

      const events: CalendarEvent[] = data.value.map((item) => {
        // Extract meeting URL
        let meetingUrl: string | null = item.onlineMeeting?.joinUrl ?? null;

        // Check body preview for meeting URLs if not found
        if (!meetingUrl && item.bodyPreview) {
          const urlMatch = item.bodyPreview.match(
            /(https:\/\/(zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com)[^\s<>"]+)/i
          );
          if (urlMatch) {
            meetingUrl = urlMatch[1];
          }
        }

        return {
          id: item.id,
          title: item.subject ?? null,
          description: item.bodyPreview ?? null,
          startTime: new Date(item.start.dateTime + 'Z'),
          endTime: new Date(item.end.dateTime + 'Z'),
          isAllDay: item.isAllDay ?? false,
          attendees: (item.attendees ?? []).map((a) => ({
            email: a.emailAddress.address,
            name: a.emailAddress.name,
            responseStatus: a.status?.response,
          })),
          organizerEmail: item.organizer?.emailAddress.address ?? null,
          meetingUrl,
          status: item.isCancelled ? 'cancelled' : 'confirmed',
        };
      });

      return {
        events,
        nextSyncCursor: data['@odata.deltaLink'] ?? null,
      };
    },

    async revokeToken(accessToken: string): Promise<void> {
      // Microsoft doesn't have a token revocation endpoint for personal accounts
      // For organizational accounts, this would go through Azure AD
      console.log('Microsoft token revocation not implemented');
    },
  };
}
