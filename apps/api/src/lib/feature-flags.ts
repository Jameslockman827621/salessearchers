// ===========================================
// Feature Flags Service (Configuration-based)
// ===========================================

import { FEATURE_FLAGS } from '@salessearchers/shared';

type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

// In-memory feature flag configuration
// In production, this could be backed by a database table or external service
const flagDefaults: Record<string, boolean> = {
  [FEATURE_FLAGS.MEETING_BOT]: true,
  [FEATURE_FLAGS.AI_INSIGHTS]: true,
  [FEATURE_FLAGS.EMAIL_SEQUENCES]: true,
  [FEATURE_FLAGS.LINKEDIN_INTEGRATION]: false,
  [FEATURE_FLAGS.DATA_ENRICHMENT]: false,
};

const tenantOverrides: Record<string, Record<string, boolean>> = {};

/**
 * Check if a feature flag is enabled for a tenant
 */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  tenantId?: string
): Promise<boolean> {
  // Check for tenant override
  if (tenantId && tenantOverrides[tenantId]?.[key] !== undefined) {
    return tenantOverrides[tenantId][key];
  }

  // Return default value
  return flagDefaults[key] ?? false;
}

/**
 * Get all feature flags for a tenant
 */
export async function getFeatureFlags(
  tenantId?: string
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = { ...flagDefaults };

  // Apply tenant overrides
  if (tenantId && tenantOverrides[tenantId]) {
    Object.assign(result, tenantOverrides[tenantId]);
  }

  return result;
}

/**
 * Set a feature flag override for a tenant
 */
export async function setFeatureFlagForTenant(
  key: FeatureFlagKey,
  tenantId: string,
  enabled: boolean
): Promise<void> {
  if (!tenantOverrides[tenantId]) {
    tenantOverrides[tenantId] = {};
  }
  tenantOverrides[tenantId][key] = enabled;
}

/**
 * Check multiple feature flags at once
 */
export async function checkFeatureFlags(
  keys: FeatureFlagKey[],
  tenantId?: string
): Promise<Record<string, boolean>> {
  const allFlags = await getFeatureFlags(tenantId);
  
  const result: Record<string, boolean> = {};
  for (const key of keys) {
    result[key] = allFlags[key] ?? false;
  }

  return result;
}
