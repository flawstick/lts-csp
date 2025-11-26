/**
 * Comprehensive Analytics Utility for LTS Tax
 *
 * Provides type-safe event tracking for all key user actions
 * Supports both client-side and server-side tracking
 * Integrates with feature flags for enriched analytics
 */

import { track as vercelTrack } from "@vercel/analytics/server";

// ============================================================================
// Event Type Definitions
// ============================================================================

/**
 * Job lifecycle events - tracking automated tax processing
 */
export type JobEvent =
  | {
      name: "job_started";
      data: {
        jobId: string;
        taskId: string;
        taskType: string;
        jurisdiction: string;
        entityName: string;
        source: "manual" | "automatic" | "retry";
      };
    }
  | {
      name: "job_paused";
      data: {
        jobId: string;
        taskId: string;
        reason: "user_requested" | "error" | "timeout";
        durationMs: number;
      };
    }
  | {
      name: "job_resumed";
      data: {
        jobId: string;
        taskId: string;
        pausedDurationMs: number;
      };
    }
  | {
      name: "job_completed";
      data: {
        jobId: string;
        taskId: string;
        success: boolean;
        totalDurationMs: number;
        stepsCompleted: number;
        autoApproved: boolean;
      };
    }
  | {
      name: "job_failed";
      data: {
        jobId: string;
        taskId: string;
        errorType: string;
        stage: string;
        durationMs: number;
      };
    };

/**
 * Task management events
 */
export type TaskEvent =
  | {
      name: "task_created";
      data: {
        taskId: string;
        taskType: string;
        jurisdiction: string;
        orgId: string;
        hasDocuments: boolean;
        documentCount: number;
      };
    }
  | {
      name: "task_viewed";
      data: {
        taskId: string;
        taskType: string;
        status: string;
      };
    }
  | {
      name: "task_deleted";
      data: {
        taskId: string;
        taskType: string;
        wasCompleted: boolean;
      };
    };

/**
 * Form and data extraction events
 */
export type FormEvent =
  | {
      name: "form_created";
      data: {
        formType: "substance_form" | "tax_return";
        taxReturnId: string;
        jurisdiction: string;
      };
    }
  | {
      name: "form_field_edited";
      data: {
        formType: "substance_form" | "tax_return";
        fieldName: string;
        taxReturnId: string;
        wasAiExtracted: boolean;
      };
    }
  | {
      name: "form_completed";
      data: {
        formType: "substance_form" | "tax_return";
        taxReturnId: string;
        completionTimeMs: number;
        fieldsExtracted: number;
        fieldsManual: number;
      };
    }
  | {
      name: "ai_extraction_started";
      data: {
        taxReturnId: string;
        documentCount: number;
        documentTypes: string[];
      };
    }
  | {
      name: "ai_extraction_completed";
      data: {
        taxReturnId: string;
        success: boolean;
        fieldsExtracted: number;
        extractionTimeMs: number;
        model: string;
      };
    };

/**
 * Document upload events
 */
export type DocumentEvent =
  | {
      name: "document_uploaded";
      data: {
        documentType: "pdf" | "image" | "other";
        sizeBytes: number;
        uploadContext: "task" | "form" | "avatar";
      };
    }
  | {
      name: "document_deleted";
      data: {
        documentType: string;
        uploadContext: string;
      };
    };

/**
 * Authentication and user events
 */
export type AuthEvent =
  | {
      name: "user_login";
      data: {
        method: "email" | "oauth";
        isNewUser: boolean;
      };
    }
  | {
      name: "user_logout";
      data: {
        sessionDurationMs: number;
      };
    }
  | {
      name: "user_profile_updated";
      data: {
        fieldsUpdated: string[];
        hasAvatar: boolean;
      };
    };

/**
 * Organisation and team events
 */
export type OrgEvent =
  | {
      name: "org_created";
      data: {
        orgId: string;
        name: string;
        initialMembers: number;
      };
    }
  | {
      name: "org_member_invited";
      data: {
        orgId: string;
        role: string;
      };
    }
  | {
      name: "org_member_removed";
      data: {
        orgId: string;
        role: string;
      };
    }
  | {
      name: "org_role_changed";
      data: {
        orgId: string;
        fromRole: string;
        toRole: string;
      };
    };

/**
 * Navigation and engagement events
 */
export type NavigationEvent =
  | {
      name: "page_viewed";
      data: {
        page: string;
        referrer?: string;
      };
    }
  | {
      name: "dashboard_viewed";
      data: {
        activeReturns: number;
        pendingTasks: number;
      };
    }
  | {
      name: "returns_list_viewed";
      data: {
        totalReturns: number;
        filterApplied?: string;
      };
    };

/**
 * System and performance events
 */
export type SystemEvent =
  | {
      name: "ecs_task_launched";
      data: {
        taskId: string;
        jobId: string;
        region: "eu-west-2"; // London
        cluster: string;
      };
    }
  | {
      name: "api_error";
      data: {
        endpoint: string;
        errorCode: string;
        errorMessage: string;
      };
    }
  | {
      name: "feature_flag_evaluated";
      data: {
        flagName: string;
        value: boolean | string;
        userId?: string;
      };
    };

/**
 * Union of all event types for type safety
 */
export type AnalyticsEvent =
  | JobEvent
  | TaskEvent
  | FormEvent
  | DocumentEvent
  | AuthEvent
  | OrgEvent
  | NavigationEvent
  | SystemEvent;

// ============================================================================
// Feature Flag Support
// ============================================================================

/**
 * Feature flags that can be attached to events
 */
export interface FeatureFlags {
  [key: string]: boolean | string | number;
}

/**
 * Enriched event with feature flag data
 */
export interface EnrichedEvent<T extends AnalyticsEvent> {
  event: T;
  flags?: FeatureFlags;
  timestamp: string;
  environment: "development" | "preview" | "production";
}

// ============================================================================
// Client-Side Tracking
// ============================================================================

/**
 * Track events from client components
 * Uses dynamic import to work with "use client" components
 */
export async function trackClient<T extends AnalyticsEvent>(
  event: T,
  flags?: FeatureFlags
): Promise<void> {
  try {
    // Dynamic import for client-side tracking
    const { track } = await import("@vercel/analytics");

    // Flatten flags into the data object with flag_ prefix
    const flattenedFlags = flags
      ? Object.entries(flags).reduce((acc, [key, value]) => {
          acc[`flag_${key}`] = String(value);
          return acc;
        }, {} as Record<string, string>)
      : {};

    // Convert arrays to strings and ensure all values are primitives
    const sanitizedData = Object.entries(event.data).reduce((acc, [key, value]) => {
      if (Array.isArray(value)) {
        acc[key] = JSON.stringify(value);
      } else if (typeof value === 'object' && value !== null) {
        acc[key] = JSON.stringify(value);
      } else {
        acc[key] = value as string | number | boolean;
      }
      return acc;
    }, {} as Record<string, string | number | boolean>);

    const enrichedData = {
      ...sanitizedData,
      ...flattenedFlags,
      _environment: process.env.NODE_ENV,
      _timestamp: new Date().toISOString(),
    };

    track(event.name, enrichedData);
  } catch (error) {
    console.error("Analytics tracking error:", error);
  }
}

// ============================================================================
// Server-Side Tracking
// ============================================================================

/**
 * Track events from server components and API routes
 */
export async function trackServer<T extends AnalyticsEvent>(
  event: T,
  flags?: FeatureFlags
): Promise<void> {
  try {
    // Flatten flags into the data object with flag_ prefix
    const flattenedFlags = flags
      ? Object.entries(flags).reduce((acc, [key, value]) => {
          acc[`flag_${key}`] = String(value);
          return acc;
        }, {} as Record<string, string>)
      : {};

    // Convert arrays to strings and ensure all values are primitives
    const sanitizedData = Object.entries(event.data).reduce((acc, [key, value]) => {
      if (Array.isArray(value)) {
        acc[key] = JSON.stringify(value);
      } else if (typeof value === 'object' && value !== null) {
        acc[key] = JSON.stringify(value);
      } else {
        acc[key] = value as string | number | boolean;
      }
      return acc;
    }, {} as Record<string, string | number | boolean>);

    const enrichedData = {
      ...sanitizedData,
      ...flattenedFlags,
      _environment: process.env.NODE_ENV,
      _timestamp: new Date().toISOString(),
    };

    await vercelTrack(event.name, enrichedData);
  } catch (error) {
    console.error("Analytics tracking error:", error);
  }
}

// ============================================================================
// Convenience Wrappers
// ============================================================================

/**
 * Track job lifecycle with automatic timing
 */
export class JobTracker {
  private startTime: number;
  private jobId: string;
  private taskId: string;

  constructor(jobId: string, taskId: string) {
    this.jobId = jobId;
    this.taskId = taskId;
    this.startTime = Date.now();
  }

  async start(data: Omit<Extract<JobEvent, { name: "job_started" }>["data"], "jobId" | "taskId">) {
    await trackServer({
      name: "job_started",
      data: {
        jobId: this.jobId,
        taskId: this.taskId,
        ...data,
      },
    });
  }

  async complete(data: Omit<Extract<JobEvent, { name: "job_completed" }>["data"], "jobId" | "taskId" | "totalDurationMs">) {
    await trackServer({
      name: "job_completed",
      data: {
        jobId: this.jobId,
        taskId: this.taskId,
        totalDurationMs: Date.now() - this.startTime,
        ...data,
      },
    });
  }

  async fail(data: Omit<Extract<JobEvent, { name: "job_failed" }>["data"], "jobId" | "taskId" | "durationMs">) {
    await trackServer({
      name: "job_failed",
      data: {
        jobId: this.jobId,
        taskId: this.taskId,
        durationMs: Date.now() - this.startTime,
        ...data,
      },
    });
  }
}

/**
 * Track form completion with field counting
 */
export class FormTracker {
  private startTime: number;
  private taxReturnId: string;
  private formType: "substance_form" | "tax_return";
  private aiExtractedFields: Set<string> = new Set();
  private manualFields: Set<string> = new Set();

  constructor(taxReturnId: string, formType: "substance_form" | "tax_return") {
    this.taxReturnId = taxReturnId;
    this.formType = formType;
    this.startTime = Date.now();
  }

  recordAiExtractedField(fieldName: string) {
    this.aiExtractedFields.add(fieldName);
  }

  recordManualField(fieldName: string) {
    this.manualFields.add(fieldName);
  }

  async complete() {
    await trackServer({
      name: "form_completed",
      data: {
        formType: this.formType,
        taxReturnId: this.taxReturnId,
        completionTimeMs: Date.now() - this.startTime,
        fieldsExtracted: this.aiExtractedFields.size,
        fieldsManual: this.manualFields.size,
      },
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get current environment
 */
export function getEnvironment(): "development" | "preview" | "production" {
  if (process.env.NODE_ENV === "development") return "development";
  if (process.env.VERCEL_ENV === "production") return "production";
  return "preview";
}

/**
 * Create enriched event object
 */
export function enrichEvent<T extends AnalyticsEvent>(
  event: T,
  flags?: FeatureFlags
): EnrichedEvent<T> {
  return {
    event,
    flags,
    timestamp: new Date().toISOString(),
    environment: getEnvironment(),
  };
}
