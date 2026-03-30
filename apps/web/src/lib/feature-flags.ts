/**
 * Feature Flags System for LTS Tax
 *
 * Integrates with Vercel Edge Config for real-time feature toggling
 * Supports A/B testing, gradual rollouts, and user-specific flags
 * Works seamlessly with analytics for feature flag enrichment
 */

import { get } from "@vercel/edge-config";
import { trackServer } from "./analytics";

// ============================================================================
// Feature Flag Definitions
// ============================================================================

/**
 * Define all feature flags in the application
 * These correspond to keys in Edge Config
 */
export type FeatureFlagKey =
  // AI & Automation Features
  | "ai_extraction_enabled"
  | "ai_extraction_model" // "gemini-3-pro" | "gemini-2-flash" | "claude-3-5-sonnet"
  | "auto_approve_enabled"
  | "agent_pause_detection"

  // UI Features
  | "new_dashboard_layout"
  | "dark_mode_toggle"
  | "analytics_dashboard"
  | "task_templates"

  // Processing Features
  | "parallel_job_processing"
  | "job_queue_priority" // "fifo" | "priority" | "smart"
  | "ecs_region" // "eu-west-2" | "us-east-1"
  | "max_concurrent_jobs"

  // Beta Features
  | "substance_form_beta"
  | "bulk_upload_beta"
  | "api_access_beta"
  | "custom_integrations"

  // Performance & Reliability
  | "enable_caching"
  | "preload_jurisdictions"
  | "optimistic_updates"
  | "retry_failed_jobs"

  // Compliance & Security
  | "audit_logging"
  | "two_factor_required"
  | "ip_whitelist_enabled"
  | "session_timeout_minutes";

/**
 * Type-safe feature flag configuration
 */
export interface FeatureFlag {
  key: FeatureFlagKey;
  defaultValue: boolean | string | number;
  description: string;
  category: "ai" | "ui" | "processing" | "beta" | "performance" | "security";
}

/**
 * Registry of all feature flags with metadata
 */
export const FEATURE_FLAGS: Record<FeatureFlagKey, FeatureFlag> = {
  // AI & Automation
  ai_extraction_enabled: {
    key: "ai_extraction_enabled",
    defaultValue: true,
    description: "Enable AI-powered document extraction for substance forms",
    category: "ai",
  },
  ai_extraction_model: {
    key: "ai_extraction_model",
    defaultValue: "gemini-3-pro-preview",
    description: "AI model to use for document extraction",
    category: "ai",
  },
  auto_approve_enabled: {
    key: "auto_approve_enabled",
    defaultValue: false,
    description: "Automatically approve jobs that pass validation",
    category: "ai",
  },
  agent_pause_detection: {
    key: "agent_pause_detection",
    defaultValue: true,
    description: "Detect when agent needs user intervention",
    category: "ai",
  },

  // UI Features
  new_dashboard_layout: {
    key: "new_dashboard_layout",
    defaultValue: true,
    description: "Use new dashboard layout with enhanced analytics",
    category: "ui",
  },
  dark_mode_toggle: {
    key: "dark_mode_toggle",
    defaultValue: true,
    description: "Enable dark mode toggle in UI",
    category: "ui",
  },
  analytics_dashboard: {
    key: "analytics_dashboard",
    defaultValue: true,
    description: "Show analytics dashboard page",
    category: "ui",
  },
  task_templates: {
    key: "task_templates",
    defaultValue: false,
    description: "Enable task templates for quick creation",
    category: "ui",
  },

  // Processing Features
  parallel_job_processing: {
    key: "parallel_job_processing",
    defaultValue: false,
    description: "Process multiple jobs in parallel",
    category: "processing",
  },
  job_queue_priority: {
    key: "job_queue_priority",
    defaultValue: "fifo",
    description: "Job queue prioritization strategy",
    category: "processing",
  },
  ecs_region: {
    key: "ecs_region",
    defaultValue: "eu-west-2",
    description: "AWS ECS region for task processing (London by default)",
    category: "processing",
  },
  max_concurrent_jobs: {
    key: "max_concurrent_jobs",
    defaultValue: 5,
    description: "Maximum number of concurrent jobs per organization",
    category: "processing",
  },

  // Beta Features
  substance_form_beta: {
    key: "substance_form_beta",
    defaultValue: true,
    description: "Access to substance form features",
    category: "beta",
  },
  bulk_upload_beta: {
    key: "bulk_upload_beta",
    defaultValue: false,
    description: "Bulk upload multiple documents at once",
    category: "beta",
  },
  api_access_beta: {
    key: "api_access_beta",
    defaultValue: false,
    description: "Access to REST API for integrations",
    category: "beta",
  },
  custom_integrations: {
    key: "custom_integrations",
    defaultValue: false,
    description: "Build custom integrations with webhooks",
    category: "beta",
  },

  // Performance & Reliability
  enable_caching: {
    key: "enable_caching",
    defaultValue: true,
    description: "Enable response caching for better performance",
    category: "performance",
  },
  preload_jurisdictions: {
    key: "preload_jurisdictions",
    defaultValue: true,
    description: "Preload jurisdiction data on page load",
    category: "performance",
  },
  optimistic_updates: {
    key: "optimistic_updates",
    defaultValue: true,
    description: "Show optimistic UI updates before server confirmation",
    category: "performance",
  },
  retry_failed_jobs: {
    key: "retry_failed_jobs",
    defaultValue: true,
    description: "Automatically retry failed jobs",
    category: "performance",
  },

  // Compliance & Security
  audit_logging: {
    key: "audit_logging",
    defaultValue: true,
    description: "Log all user actions for compliance",
    category: "security",
  },
  two_factor_required: {
    key: "two_factor_required",
    defaultValue: false,
    description: "Require 2FA for all users",
    category: "security",
  },
  ip_whitelist_enabled: {
    key: "ip_whitelist_enabled",
    defaultValue: false,
    description: "Enable IP whitelisting for organizations",
    category: "security",
  },
  session_timeout_minutes: {
    key: "session_timeout_minutes",
    defaultValue: 60,
    description: "Session timeout in minutes",
    category: "security",
  },
};

// ============================================================================
// Feature Flag Evaluation
// ============================================================================

/**
 * Context for evaluating feature flags
 * Can be extended with user properties, org properties, etc.
 */
export interface FlagContext {
  userId?: string;
  orgId?: string;
  userEmail?: string;
  userRole?: string;
  environment?: "development" | "preview" | "production";
}

/**
 * Get feature flag value from Edge Config
 * Falls back to default value if not found or Edge Config is not configured
 */
export async function getFlag<T extends boolean | string | number>(
  key: FeatureFlagKey,
  context?: FlagContext
): Promise<T> {
  try {
    // Try to get from Edge Config
    const value = await get<T>(key);

    // Track flag evaluation for analytics
    await trackServer({
      name: "feature_flag_evaluated",
      data: {
        flagName: key,
        value: String(value ?? FEATURE_FLAGS[key].defaultValue),
        userId: context?.userId,
      },
    });

    // Return value from Edge Config or default
    return (value ?? FEATURE_FLAGS[key].defaultValue) as T;
  } catch (error) {
    console.error(`Failed to get feature flag ${key}:`, error);
    return FEATURE_FLAGS[key].defaultValue as T;
  }
}

/**
 * Get multiple feature flags at once
 * More efficient than calling getFlag multiple times
 */
export async function getFlags(
  keys: FeatureFlagKey[],
  context?: FlagContext
): Promise<Record<string, boolean | string | number>> {
  const flags: Record<string, boolean | string | number> = {};

  await Promise.all(
    keys.map(async (key) => {
      flags[key] = await getFlag(key, context);
    })
  );

  return flags;
}

/**
 * Check if a feature is enabled (boolean flag)
 */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  context?: FlagContext
): Promise<boolean> {
  const value = await getFlag<boolean>(key, context);
  return value === true;
}

/**
 * Get all flags for analytics enrichment
 * Returns a flat object of flag key-value pairs
 */
export async function getAllFlagsForAnalytics(
  context?: FlagContext
): Promise<Record<string, boolean | string | number>> {
  const keys = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];
  return getFlags(keys, context);
}

// ============================================================================
// A/B Testing Support
// ============================================================================

/**
 * Variant assignment for A/B tests
 */
export type Variant = "control" | "treatment" | string;

/**
 * Assign user to A/B test variant
 * Uses consistent hashing based on user ID to ensure stable assignments
 */
export function getVariant(
  testName: string,
  userId: string,
  variants: Variant[] = ["control", "treatment"]
): Variant {
  // Simple hash function for consistent variant assignment
  let hash = 0;
  const input = `${testName}:${userId}`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const index = Math.abs(hash) % variants.length;
  return variants[index]!;
}

/**
 * Track A/B test assignment
 */
export async function trackVariantAssignment(
  testName: string,
  variant: Variant,
  userId: string
): Promise<void> {
  await trackServer({
    name: "feature_flag_evaluated",
    data: {
      flagName: `ab_test_${testName}`,
      value: variant,
      userId,
    },
  });
}

// ============================================================================
// Gradual Rollout Support
// ============================================================================

/**
 * Check if user is in gradual rollout percentage
 * @param percentage - Percentage of users to include (0-100)
 * @param userId - User ID for consistent assignment
 */
export function isInRollout(percentage: number, userId: string): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;

  // Use consistent hashing
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  const bucket = Math.abs(hash) % 100;
  return bucket < percentage;
}

// ============================================================================
// Edge Config Utilities
// ============================================================================

/**
 * Check if Edge Config is properly configured
 */
export function isEdgeConfigEnabled(): boolean {
  return !!process.env.EDGE_CONFIG;
}

/**
 * Get Edge Config connection info for debugging
 */
export function getEdgeConfigInfo(): {
  enabled: boolean;
  connectionString?: string;
} {
  return {
    enabled: isEdgeConfigEnabled(),
    connectionString: process.env.EDGE_CONFIG
      ? `${process.env.EDGE_CONFIG.slice(0, 30)}...`
      : undefined,
  };
}

// ============================================================================
// Feature Flag Presets
// ============================================================================

/**
 * Common flag combinations for different scenarios
 */
export const FLAG_PRESETS = {
  // Beta tester gets all beta features
  BETA_TESTER: [
    "substance_form_beta",
    "bulk_upload_beta",
    "api_access_beta",
    "custom_integrations",
  ] as FeatureFlagKey[],

  // Performance optimizations
  PERFORMANCE_MODE: [
    "enable_caching",
    "preload_jurisdictions",
    "optimistic_updates",
    "parallel_job_processing",
  ] as FeatureFlagKey[],

  // Security hardening
  SECURITY_MODE: [
    "audit_logging",
    "two_factor_required",
    "ip_whitelist_enabled",
  ] as FeatureFlagKey[],

  // Development mode
  DEVELOPMENT: [
    "new_dashboard_layout",
    "analytics_dashboard",
    "task_templates",
  ] as FeatureFlagKey[],
} as const;

/**
 * Check if user has a preset enabled
 */
export async function hasPreset(
  preset: keyof typeof FLAG_PRESETS,
  context?: FlagContext
): Promise<boolean> {
  const flags = FLAG_PRESETS[preset];
  const values = await Promise.all(
    flags.map((flag) => isFeatureEnabled(flag, context))
  );
  return values.every((v) => v === true);
}
