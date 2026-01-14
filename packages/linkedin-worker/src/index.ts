/**
 * LinkedIn Worker
 * 
 * Main entry point for the LinkedIn automation worker.
 * This service runs independently and processes LinkedIn actions from the queue.
 */

import { prisma } from '@salessearchers/db';
import { decryptJson, encryptJson } from '@salessearchers/shared';
import { ActionExecutor } from './action-executor.js';
import { CampaignScheduler } from './scheduler.js';
import { LinkedInBrowser, LinkedInCredentials } from './linkedin-browser.js';

const WORKER_ID = `worker-${process.pid}-${Date.now()}`;
const POLL_INTERVAL = 30000; // 30 seconds
const SCHEDULER_INTERVAL = 60000; // 1 minute
const VERIFICATION_INTERVAL = 10000; // 10 seconds - check for new accounts more frequently
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-encryption-key-change-in-prod';

let isRunning = true;

// Environment check for visible browser mode
const USE_VISIBLE_BROWSER = process.env.VISIBLE_BROWSER === 'true';

/**
 * Verify credentials for accounts with VERIFYING status
 * Uses a VISIBLE browser window so user can solve captcha/checkpoints
 */
async function verifyPendingAccounts(): Promise<void> {
  // Find accounts that need verification
  const accountsToVerify = await prisma.linkedInAccount.findMany({
    where: {
      status: 'VERIFYING',
    },
    take: 1, // Only process 1 at a time for interactive login
  });

  // Filter out accounts without credentials
  const accountsWithCredentials = accountsToVerify.filter(a => a.credentials !== null);

  if (accountsWithCredentials.length === 0) {
    return;
  }

  console.log(`[${WORKER_ID}] Found ${accountsWithCredentials.length} accounts to verify`);

  for (const account of accountsWithCredentials) {
    if (!isRunning) break;

    console.log(`[${WORKER_ID}] Verifying account: ${account.name} (${account.id})`);
    console.log(`[${WORKER_ID}] 🖥️  Opening VISIBLE browser window - please complete any captcha/verification...`);

    let browser: LinkedInBrowser | null = null;

    try {
      // Decrypt credentials
      let credentials: LinkedInCredentials;
      try {
        credentials = typeof account.credentials === 'string'
          ? decryptJson<LinkedInCredentials>(account.credentials, ENCRYPTION_KEY)
          : account.credentials as unknown as LinkedInCredentials;
      } catch (e) {
        console.error(`[${WORKER_ID}] Failed to decrypt credentials for account ${account.id}:`, e);
        await prisma.linkedInAccount.update({
          where: { id: account.id },
          data: {
            status: 'DISCONNECTED',
            errorCode: 'DECRYPT_FAILED',
            errorMessage: 'Failed to decrypt credentials',
          },
        });
        continue;
      }

      // Initialize browser - VISIBLE MODE for user to interact with
      browser = new LinkedInBrowser(account.id, WORKER_ID);
      await browser.init(false); // headless=false = visible browser
      await browser.createContext();

      // Update status to show user we're waiting for them
      await prisma.linkedInAccount.update({
        where: { id: account.id },
        data: {
          errorMessage: 'Browser opened - please complete login in the popup window',
        },
      });

      // Use interactive login - waits for user to complete any captcha/verification
      console.log(`[${WORKER_ID}] Attempting interactive LinkedIn login for ${account.email || account.name}...`);
      const loginResult = await browser.loginInteractive(
        credentials,
        300000, // 5 minute timeout
        (status) => console.log(`[${WORKER_ID}] ${status}`)
      );

      if (loginResult.success) {
        console.log(`[${WORKER_ID}] ✅ Login successful for ${account.name}`);
        
        // Save session data
        const sessionData = await browser.exportSession();
        
        await prisma.linkedInAccount.update({
          where: { id: account.id },
          data: {
            status: 'CONNECTED',
            sessionData: encryptJson(sessionData, ENCRYPTION_KEY),
            lastVerifiedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
      } else {
        console.error(`[${WORKER_ID}] ❌ Login failed for ${account.name}: ${loginResult.error}`);
        
        // Determine appropriate status based on error
        let newStatus: 'DISCONNECTED' | 'NEEDS_ATTENTION' = 'DISCONNECTED';
        if (loginResult.errorCode === 'LOGIN_TIMEOUT') {
          newStatus = 'NEEDS_ATTENTION';
        }

        await prisma.linkedInAccount.update({
          where: { id: account.id },
          data: {
            status: newStatus,
            errorCode: loginResult.errorCode || 'LOGIN_FAILED',
            errorMessage: loginResult.error || 'Login failed',
          },
        });
      }

    } catch (error) {
      console.error(`[${WORKER_ID}] Error verifying account ${account.id}:`, error);
      
      await prisma.linkedInAccount.update({
        where: { id: account.id },
        data: {
          status: 'DISCONNECTED',
          errorCode: 'VERIFICATION_ERROR',
          errorMessage: error instanceof Error ? error.message : 'Unknown error during verification',
        },
      });
    } finally {
      // Close browser
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore close errors
        }
      }
    }

    // Small delay between verifications
    await sleep(2000);
  }
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
  console.log(`[${WORKER_ID}] LinkedIn Worker starting...`);

  const executor = new ActionExecutor();
  const scheduler = new CampaignScheduler();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`[${WORKER_ID}] Received SIGINT, shutting down...`);
    isRunning = false;
  });

  process.on('SIGTERM', () => {
    console.log(`[${WORKER_ID}] Received SIGTERM, shutting down...`);
    isRunning = false;
  });

  let lastSchedulerRun = 0;
  let lastVerificationRun = 0;

  while (isRunning) {
    try {
      const now = Date.now();

      // Check for accounts needing verification (more frequently)
      if (now - lastVerificationRun > VERIFICATION_INTERVAL) {
        await verifyPendingAccounts();
        lastVerificationRun = now;
      }

      // Run scheduler periodically
      if (now - lastSchedulerRun > SCHEDULER_INTERVAL) {
        console.log(`[${WORKER_ID}] Running scheduler...`);
        await scheduler.processCampaigns();
        await scheduler.scheduleInboxSyncs();
        lastSchedulerRun = now;
      }

      // Get accounts with pending actions
      const accountsWithActions = await getAccountsWithPendingActions();
      
      console.log(`[${WORKER_ID}] Found ${accountsWithActions.length} accounts with pending actions`);

      // Process each account
      for (const accountId of accountsWithActions) {
        if (!isRunning) break;
        await executor.processAccountActions(accountId);
      }

      // Wait before next poll
      await sleep(POLL_INTERVAL);

    } catch (error) {
      console.error(`[${WORKER_ID}] Error in worker loop:`, error);
      await sleep(5000); // Wait 5 seconds on error
    }
  }

  console.log(`[${WORKER_ID}] Worker stopped`);
  await prisma.$disconnect();
}

/**
 * Get accounts that have pending actions ready to execute
 */
async function getAccountsWithPendingActions(): Promise<string[]> {
  const now = new Date();
  const lockTimeout = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes

  // Find accounts with pending actions that are due and not locked
  const accounts = await prisma.linkedInAccount.findMany({
    where: {
      status: 'CONNECTED',
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: lockTimeout } },
      ],
      actions: {
        some: {
          status: 'PENDING',
          scheduledAt: { lte: now },
        },
      },
    },
    select: { id: true },
    take: 10, // Process up to 10 accounts per cycle
  });

  return accounts.map(a => a.id);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export components for use in API
export { LinkedInBrowser, LinkedInCredentials, LinkedInSessionData } from './linkedin-browser.js';
export { ActionExecutor } from './action-executor.js';
export { CampaignScheduler } from './scheduler.js';

// Run worker if this is the main module
const isMainModule = typeof require !== 'undefined' && require.main === module;
if (isMainModule || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  runWorker().catch(console.error);
}

