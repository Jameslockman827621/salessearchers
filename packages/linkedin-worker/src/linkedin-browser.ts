/**
 * LinkedIn Browser Automation Module
 * 
 * This module handles all direct interactions with LinkedIn via Playwright.
 * It manages sessions, executes actions, and extracts data.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { generateTOTP } from '@salessearchers/shared';

// LinkedIn URLs
const LINKEDIN_URL = 'https://www.linkedin.com';
const LOGIN_URL = 'https://www.linkedin.com/login';
const FEED_URL = 'https://www.linkedin.com/feed/';

// Session data interface
export interface LinkedInSessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  localStorage?: Record<string, string>;
  userAgent?: string;
}

// Credentials interface
export interface LinkedInCredentials {
  email: string;
  password: string;
  twoFASecret?: string;
  country?: string;
}

// Profile data extracted from LinkedIn
export interface LinkedInProfileData {
  linkedinId?: string;
  name: string;
  headline?: string;
  company?: string;
  location?: string;
  avatarUrl?: string;
  connectionStatus: 'not_connected' | 'pending_sent' | 'pending_received' | 'connected' | 'blocked';
  connectionDegree?: string; // "1st", "2nd", "3rd", etc.
  [key: string]: unknown; // Index signature for Record compatibility
}

// Message data
export interface LinkedInMessageData {
  threadId: string;
  messageId?: string;
  body: string;
  senderName: string;
  senderUrl?: string;
  senderLinkedinId?: string;
  sentAt: Date;
  isOutbound: boolean;
}

// Action results
export interface ActionResult<T = Record<string, unknown>> {
  success: boolean;
  error?: string;
  errorCode?: string;
  data?: T;
}

export class LinkedInBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private accountId: string;
  private workerId: string;

  constructor(accountId: string, workerId: string) {
    this.accountId = accountId;
    this.workerId = workerId;
  }

  /**
   * Initialize browser instance
   * @param headless - If false, browser window will be visible for user interaction (captcha solving)
   */
  async init(headless: boolean = true): Promise<void> {
    this.browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--start-maximized',
      ],
      slowMo: headless ? 0 : 50, // Slow down actions when visible for better UX
    });
  }

  /**
   * Create or restore session context
   */
  async createContext(sessionData?: LinkedInSessionData): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: { width: 1280, height: 800 },
      userAgent: sessionData?.userAgent || 
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
    };

    this.context = await this.browser.newContext(contextOptions);

    // Restore cookies if we have session data
    if (sessionData?.cookies && sessionData.cookies.length > 0) {
      await this.context.addCookies(sessionData.cookies);
    }

    this.page = await this.context.newPage();

    // Add stealth measures via script string (runs in browser context)
    await this.page.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    `);
  }

  /**
   * Export current session data for persistence
   */
  async exportSession(): Promise<LinkedInSessionData> {
    if (!this.context) {
      throw new Error('Context not initialized');
    }

    const cookies = await this.context.cookies();
    
    return {
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as 'Strict' | 'Lax' | 'None',
      })),
    };
  }

  /**
   * Check if the current session is valid
   */
  async isSessionValid(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(FEED_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Check if we're on the feed (logged in) or redirected to login
      const url = this.page.url();
      
      if (url.includes('/login') || url.includes('/checkpoint')) {
        return false;
      }

      // Additional check: look for the nav bar that only appears when logged in
      const navBar = await this.page.$('.global-nav');
      return navBar !== null;
    } catch {
      return false;
    }
  }

  /**
   * Login with credentials (automated - for headless mode)
   */
  async login(credentials: LinkedInCredentials): Promise<ActionResult> {
    if (!this.page) {
      return { success: false, error: 'Page not initialized', errorCode: 'NO_PAGE' };
    }

    try {
      await this.page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for login form
      await this.page.waitForSelector('#username', { timeout: 10000 });
      
      // Enter credentials with human-like delays
      await this.page.fill('#username', credentials.email);
      await this.randomDelay(500, 1000);
      
      await this.page.fill('#password', credentials.password);
      await this.randomDelay(500, 1000);
      
      // Click sign in
      await this.page.click('button[type="submit"]');
      
      // Wait for navigation
      await this.page.waitForNavigation({ timeout: 30000 }).catch(() => {});
      
      // Check for 2FA challenge
      const url = this.page.url();
      
      if (url.includes('/checkpoint/challenge')) {
        // 2FA required
        if (!credentials.twoFASecret) {
          return { 
            success: false, 
            error: '2FA required but no secret provided', 
            errorCode: 'TWO_FA_REQUIRED' 
          };
        }
        
        // Generate TOTP code
        const totpCode = generateTOTP(credentials.twoFASecret);
        
        // Look for the verification code input
        const codeInput = await this.page.$('input[name="pin"]');
        if (codeInput) {
          await codeInput.fill(totpCode);
          await this.randomDelay(500, 1000);
          
          // Submit 2FA
          await this.page.click('button[type="submit"]');
          await this.page.waitForNavigation({ timeout: 30000 }).catch(() => {});
        }
      }
      
      // Check for other challenges (captcha, phone verification, etc.)
      const currentUrl = this.page.url();
      
      if (currentUrl.includes('/checkpoint')) {
        // We hit a checkpoint we can't handle automatically
        return { 
          success: false, 
          error: 'LinkedIn checkpoint detected - manual intervention required', 
          errorCode: 'CHECKPOINT' 
        };
      }
      
      if (currentUrl.includes('/login')) {
        // Still on login page - credentials might be wrong
        const errorElement = await this.page.$('.form__label--error');
        const errorText = errorElement ? await errorElement.textContent() : 'Login failed';
        return { 
          success: false, 
          error: errorText || 'Invalid credentials', 
          errorCode: 'INVALID_CREDENTIALS' 
        };
      }
      
      // Check if we reached the feed
      if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
        return { success: true };
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed', 
        errorCode: 'LOGIN_ERROR' 
      };
    }
  }

  /**
   * Interactive login - opens visible browser for user to complete login manually
   * This handles captcha, phone verification, etc. by letting user solve them
   * @param credentials - Pre-fill credentials (optional)
   * @param timeoutMs - How long to wait for user to complete login (default 5 minutes)
   * @param onStatusUpdate - Callback for status updates
   */
  async loginInteractive(
    credentials?: Partial<LinkedInCredentials>,
    timeoutMs: number = 300000,
    onStatusUpdate?: (status: string) => void
  ): Promise<ActionResult> {
    if (!this.page) {
      return { success: false, error: 'Page not initialized', errorCode: 'NO_PAGE' };
    }

    const updateStatus = (msg: string) => {
      console.log(`[Interactive Login] ${msg}`);
      onStatusUpdate?.(msg);
    };

    try {
      updateStatus('Opening LinkedIn login page...');
      await this.page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Pre-fill credentials if provided
      const usernameInput = await this.page.$('#username');
      if (usernameInput && credentials?.email) {
        updateStatus('Pre-filling email...');
        await usernameInput.fill(credentials.email);
      }
      
      const passwordInput = await this.page.$('#password');
      if (passwordInput && credentials?.password) {
        updateStatus('Pre-filling password...');
        await passwordInput.fill(credentials.password);
        
        // Auto-submit if both credentials provided
        if (credentials.email) {
          updateStatus('Submitting login form...');
          await this.page.click('button[type="submit"]');
        }
      }

      updateStatus('Waiting for you to complete login (solve any captcha if needed)...');
      
      // Poll for successful login
      const startTime = Date.now();
      const pollInterval = 2000; // Check every 2 seconds
      
      while (Date.now() - startTime < timeoutMs) {
        await this.randomDelay(pollInterval, pollInterval + 500);
        
        const currentUrl = this.page.url();
        
        // Check if we reached the feed (successful login)
        if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork') || currentUrl.includes('/in/')) {
          updateStatus('Login successful! Capturing session...');
          return { success: true };
        }
        
        // Check for login errors
        if (currentUrl.includes('/login')) {
          const errorElement = await this.page.$('.form__label--error');
          if (errorElement) {
            const errorText = await errorElement.textContent();
            if (errorText && errorText.trim()) {
              return { 
                success: false, 
                error: errorText.trim(), 
                errorCode: 'INVALID_CREDENTIALS' 
              };
            }
          }
        }
        
        // Still waiting - update status based on current page
        if (currentUrl.includes('/checkpoint')) {
          updateStatus('Please complete the security verification in the browser window...');
        } else if (currentUrl.includes('/login')) {
          updateStatus('Please enter your credentials and click Sign In...');
        }
      }
      
      // Timeout reached
      return { 
        success: false, 
        error: 'Login timed out - please try again', 
        errorCode: 'LOGIN_TIMEOUT' 
      };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Interactive login failed', 
        errorCode: 'LOGIN_ERROR' 
      };
    }
  }

  /**
   * Visit a LinkedIn profile and extract data
   */
  async viewProfile(profileUrl: string): Promise<ActionResult<LinkedInProfileData>> {
    if (!this.page) {
      return { success: false, error: 'Page not initialized', errorCode: 'NO_PAGE' };
    }

    try {
      // Clean the profile URL
      const cleanUrl = this.normalizeProfileUrl(profileUrl);
      
      await this.page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.randomDelay(2000, 4000); // LinkedIn tracks quick visits
      
      // Check if profile exists
      const notFound = await this.page.$('.not-found-section');
      if (notFound) {
        return { success: false, error: 'Profile not found', errorCode: 'PROFILE_NOT_FOUND' };
      }
      
      // Extract profile data
      const profileData = await this.extractProfileData();
      
      return { success: true, data: profileData };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to view profile', 
        errorCode: 'VIEW_PROFILE_ERROR' 
      };
    }
  }

  /**
   * Extract profile data from the current page
   */
  private async extractProfileData(): Promise<LinkedInProfileData> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    // Get name
    const nameElement = await this.page.$('h1.text-heading-xlarge');
    const name = nameElement ? await nameElement.textContent() : 'Unknown';
    
    // Get headline
    const headlineElement = await this.page.$('.text-body-medium.break-words');
    const headline = headlineElement ? await headlineElement.textContent() : undefined;
    
    // Get avatar URL
    const avatarElement = await this.page.$('.pv-top-card-profile-picture__image--show');
    const avatarUrl = avatarElement ? await avatarElement.getAttribute('src') : undefined;
    
    // Determine connection status
    let connectionStatus: LinkedInProfileData['connectionStatus'] = 'not_connected';
    
    // Check for "Connect" button
    const connectButton = await this.page.$('button:has-text("Connect")');
    if (connectButton) {
      connectionStatus = 'not_connected';
    }
    
    // Check for "Pending" button
    const pendingButton = await this.page.$('button:has-text("Pending")');
    if (pendingButton) {
      connectionStatus = 'pending_sent';
    }
    
    // Check for "Message" button (usually means connected)
    const messageButton = await this.page.$('button:has-text("Message")');
    if (messageButton && !connectButton) {
      connectionStatus = 'connected';
    }
    
    // Check connection degree
    const degreeElement = await this.page.$('.dist-value');
    const connectionDegree = degreeElement ? await degreeElement.textContent() : undefined;
    if (connectionDegree === '1st') {
      connectionStatus = 'connected';
    }
    
    // Get LinkedIn ID from URL
    const url = this.page.url();
    const linkedinIdMatch = url.match(/\/in\/([^/?]+)/);
    const linkedinId = linkedinIdMatch ? linkedinIdMatch[1] : undefined;
    
    return {
      linkedinId,
      name: name?.trim() || 'Unknown',
      headline: headline?.trim(),
      avatarUrl: avatarUrl || undefined,
      connectionStatus,
      connectionDegree: connectionDegree?.trim(),
    };
  }

  /**
   * Send a connection request
   */
  async sendConnectionRequest(profileUrl: string, note?: string): Promise<ActionResult> {
    if (!this.page) {
      return { success: false, error: 'Page not initialized', errorCode: 'NO_PAGE' };
    }

    try {
      // First view the profile
      const viewResult = await this.viewProfile(profileUrl);
      if (!viewResult.success) {
        return viewResult;
      }
      
      // Check if already connected
      if (viewResult.data?.connectionStatus === 'connected') {
        return { 
          success: true, 
          data: { alreadyConnected: true, connectionStatus: 'connected' } 
        };
      }
      
      if (viewResult.data?.connectionStatus === 'pending_sent') {
        return { 
          success: true, 
          data: { alreadyPending: true, connectionStatus: 'pending_sent' } 
        };
      }
      
      // Find and click the Connect button
      const connectButton = await this.page.$('button:has-text("Connect")');
      if (!connectButton) {
        // Try the "More" dropdown
        const moreButton = await this.page.$('button:has-text("More")');
        if (moreButton) {
          await moreButton.click();
          await this.randomDelay(500, 1000);
          
          const connectOption = await this.page.$('div[role="menuitem"]:has-text("Connect")');
          if (connectOption) {
            await connectOption.click();
          } else {
            return { 
              success: false, 
              error: 'Connect option not found in menu', 
              errorCode: 'NO_CONNECT_OPTION' 
            };
          }
        } else {
          return { 
            success: false, 
            error: 'Connect button not found', 
            errorCode: 'NO_CONNECT_BUTTON' 
          };
        }
      } else {
        await connectButton.click();
      }
      
      await this.randomDelay(1000, 2000);
      
      // Handle the connection modal
      // Check if we can add a note
      if (note) {
        const addNoteButton = await this.page.$('button:has-text("Add a note")');
        if (addNoteButton) {
          await addNoteButton.click();
          await this.randomDelay(500, 1000);
          
          const noteTextarea = await this.page.$('textarea[name="message"]');
          if (noteTextarea) {
            // LinkedIn limits notes to 300 characters
            const truncatedNote = note.substring(0, 300);
            await noteTextarea.fill(truncatedNote);
            await this.randomDelay(500, 1000);
          }
        }
      }
      
      // Click Send/Done button
      const sendButton = await this.page.$('button:has-text("Send")');
      if (sendButton) {
        await sendButton.click();
        await this.randomDelay(1000, 2000);
      } else {
        // Try clicking "Send without a note" or just close
        const sendWithoutNote = await this.page.$('button:has-text("Send without a note")');
        if (sendWithoutNote) {
          await sendWithoutNote.click();
          await this.randomDelay(1000, 2000);
        }
      }
      
      return { 
        success: true, 
        data: { connectionStatus: 'pending_sent' } 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to send connection request', 
        errorCode: 'CONNECTION_REQUEST_ERROR' 
      };
    }
  }

  /**
   * Send a direct message (requires being connected)
   */
  async sendMessage(profileUrl: string, message: string): Promise<ActionResult> {
    if (!this.page) {
      return { success: false, error: 'Page not initialized', errorCode: 'NO_PAGE' };
    }

    try {
      // Navigate to profile
      const cleanUrl = this.normalizeProfileUrl(profileUrl);
      await this.page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.randomDelay(2000, 4000);
      
      // Find and click the Message button
      const messageButton = await this.page.$('button:has-text("Message")');
      if (!messageButton) {
        return { 
          success: false, 
          error: 'Message button not found - user may not be connected', 
          errorCode: 'NOT_CONNECTED' 
        };
      }
      
      await messageButton.click();
      await this.randomDelay(1500, 2500);
      
      // Wait for messaging pane
      const messageInput = await this.page.waitForSelector(
        '.msg-form__contenteditable, [contenteditable="true"]',
        { timeout: 10000 }
      );
      
      if (!messageInput) {
        return { 
          success: false, 
          error: 'Message input not found', 
          errorCode: 'NO_MESSAGE_INPUT' 
        };
      }
      
      // Type the message with human-like speed
      await messageInput.click();
      await this.randomDelay(500, 1000);
      await messageInput.fill(message);
      await this.randomDelay(1000, 2000);
      
      // Click send
      const sendButton = await this.page.$('button.msg-form__send-button, button:has-text("Send")');
      if (sendButton) {
        await sendButton.click();
        await this.randomDelay(1500, 2500);
        
        return { success: true, data: { messageSent: true } };
      }
      
      return { 
        success: false, 
        error: 'Send button not found', 
        errorCode: 'NO_SEND_BUTTON' 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to send message', 
        errorCode: 'MESSAGE_ERROR' 
      };
    }
  }

  /**
   * Check if a connection request has been accepted
   */
  async checkConnectionAccepted(profileUrl: string): Promise<ActionResult & { isConnected?: boolean }> {
    const result = await this.viewProfile(profileUrl);
    
    if (!result.success) {
      return result;
    }
    
    const isConnected = result.data?.connectionStatus === 'connected';
    
    return { 
      success: true, 
      data: { 
        ...result.data,
        isConnected 
      },
      isConnected
    };
  }

  /**
   * Sync messages from inbox
   */
  async syncMessages(since?: Date): Promise<ActionResult & { messages?: LinkedInMessageData[] }> {
    if (!this.page) {
      return { success: false, error: 'Page not initialized', errorCode: 'NO_PAGE' };
    }

    try {
      // Navigate to messaging
      await this.page.goto('https://www.linkedin.com/messaging/', { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      await this.randomDelay(2000, 4000);
      
      const messages: LinkedInMessageData[] = [];
      
      // Get conversation list
      const conversations = await this.page.$$('.msg-conversation-listitem');
      
      for (const conv of conversations.slice(0, 20)) { // Limit to recent 20
        try {
          await conv.click();
          await this.randomDelay(1000, 2000);
          
          // Extract thread ID from URL
          const url = this.page.url();
          const threadIdMatch = url.match(/thread\/(\d+)/);
          const threadId = threadIdMatch ? threadIdMatch[1] : `thread_${Date.now()}`;
          
          // Get messages in this thread
          const messageElements = await this.page.$$('.msg-s-message-list__event');
          
          for (const msgEl of messageElements) {
            const bodyEl = await msgEl.$('.msg-s-event-listitem__body');
            const body = bodyEl ? await bodyEl.textContent() : '';
            
            const nameEl = await msgEl.$('.msg-s-message-group__name');
            const senderName = nameEl ? await nameEl.textContent() : 'Unknown';
            
            const timeEl = await msgEl.$('.msg-s-message-group__timestamp');
            const timeText = timeEl ? await timeEl.getAttribute('datetime') : null;
            const sentAt = timeText ? new Date(timeText) : new Date();
            
            // Skip if before our since date
            if (since && sentAt < since) continue;
            
            // Determine if outbound (check for "You" or similar indicators)
            const isOutbound = senderName?.toLowerCase().includes('you') || false;
            
            messages.push({
              threadId,
              body: body?.trim() || '',
              senderName: senderName?.trim() || 'Unknown',
              sentAt,
              isOutbound,
            });
          }
        } catch {
          // Skip this conversation on error
          continue;
        }
      }
      
      return { success: true, messages };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to sync messages', 
        errorCode: 'SYNC_MESSAGES_ERROR' 
      };
    }
  }

  /**
   * Normalize a LinkedIn profile URL
   */
  private normalizeProfileUrl(url: string): string {
    // If it's already a full URL, clean it
    if (url.startsWith('http')) {
      const parsed = new URL(url);
      return `${LINKEDIN_URL}${parsed.pathname}`;
    }
    
    // If it's just the /in/username part
    if (url.startsWith('/in/')) {
      return `${LINKEDIN_URL}${url}`;
    }
    
    // If it's just a username
    return `${LINKEDIN_URL}/in/${url}`;
  }

  /**
   * Add random delay to mimic human behavior
   */
  private async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

