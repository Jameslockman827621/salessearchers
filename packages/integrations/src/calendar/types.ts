// ===========================================
// Calendar Integration Types
// ===========================================

export interface CalendarEvent {
  id: string;
  title: string | null;
  description: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  attendees: Array<{
    email: string;
    name?: string;
    responseStatus?: string;
  }>;
  organizerEmail: string | null;
  meetingUrl: string | null;
  status: 'confirmed' | 'cancelled' | 'tentative';
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
}

export interface CalendarProvider {
  getAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refreshToken(refreshToken: string): Promise<OAuthTokens>;
  listEvents(
    accessToken: string,
    options: {
      timeMin?: Date;
      timeMax?: Date;
      syncToken?: string;
      deltaLink?: string;
    }
  ): Promise<{ events: CalendarEvent[]; nextSyncCursor: string | null }>;
  revokeToken?(accessToken: string): Promise<void>;
}
