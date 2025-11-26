/**
 * React Hooks for Feature Flags
 *
 * Client-side hooks for accessing feature flags in React components
 * Provides a clean API for conditional rendering based on flags
 */

"use client";

import { useState, useEffect } from "react";
import type { FeatureFlagKey } from "./feature-flags";

/**
 * Cache for feature flags to avoid excessive API calls
 */
const flagCache = new Map<string, boolean | string | number>();

/**
 * Hook to get a single feature flag value
 * Fetches from API and caches the result
 */
export function useFeatureFlag<T extends boolean | string | number>(
  key: FeatureFlagKey,
  defaultValue?: T
): {
  value: T | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const [value, setValue] = useState<T | undefined>(
    (flagCache.get(key) as T) ?? defaultValue
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check cache first
    const cached = flagCache.get(key);
    if (cached !== undefined) {
      setValue(cached as T);
      setIsLoading(false);
      return;
    }

    // Fetch from API
    fetch(`/api/feature-flags/${key}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch flag ${key}`);
        return res.json();
      })
      .then((data) => {
        const flagValue = data.value as T;
        flagCache.set(key, flagValue);
        setValue(flagValue);
        setError(null);
      })
      .catch((err) => {
        console.error(`Failed to fetch feature flag ${key}:`, err);
        setError(err as Error);
        // Use default value on error
        if (defaultValue !== undefined) {
          setValue(defaultValue);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [key, defaultValue]);

  return { value, isLoading, error };
}

/**
 * Hook to check if a feature is enabled (boolean flag)
 * Simpler version of useFeatureFlag for boolean flags
 */
export function useFeatureEnabled(
  key: FeatureFlagKey,
  defaultValue: boolean = false
): {
  isEnabled: boolean;
  isLoading: boolean;
  error: Error | null;
} {
  const { value, isLoading, error } = useFeatureFlag<boolean>(
    key,
    defaultValue
  );

  return {
    isEnabled: value ?? defaultValue,
    isLoading,
    error,
  };
}

/**
 * Hook to get multiple feature flags at once
 * More efficient than using multiple useFeatureFlag hooks
 */
export function useFeatureFlags(
  keys: FeatureFlagKey[]
): {
  flags: Record<string, boolean | string | number>;
  isLoading: boolean;
  error: Error | null;
} {
  const [flags, setFlags] = useState<Record<string, boolean | string | number>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check cache first
    const cached: Record<string, boolean | string | number> = {};
    const uncachedKeys: FeatureFlagKey[] = [];

    for (const key of keys) {
      const cachedValue = flagCache.get(key);
      if (cachedValue !== undefined) {
        cached[key] = cachedValue;
      } else {
        uncachedKeys.push(key);
      }
    }

    // If all flags are cached, return immediately
    if (uncachedKeys.length === 0) {
      setFlags(cached);
      setIsLoading(false);
      return;
    }

    // Fetch uncached flags from API
    fetch("/api/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: uncachedKeys }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch feature flags");
        return res.json();
      })
      .then((data) => {
        const fetchedFlags = data.flags as Record<
          string,
          boolean | string | number
        >;

        // Update cache
        for (const [key, value] of Object.entries(fetchedFlags)) {
          flagCache.set(key, value);
        }

        // Merge cached and fetched flags
        setFlags({ ...cached, ...fetchedFlags });
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to fetch feature flags:", err);
        setError(err as Error);
        // Use cached flags on error
        setFlags(cached);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [keys.join(",")]);

  return { flags, isLoading, error };
}

/**
 * Hook for A/B testing
 * Returns the variant assignment for the current user
 */
export function useABTest(
  testName: string,
  variants: string[] = ["control", "treatment"]
): {
  variant: string | null;
  isLoading: boolean;
  error: Error | null;
} {
  const [variant, setVariant] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check cache first
    const cacheKey = `ab_test_${testName}`;
    const cached = flagCache.get(cacheKey);
    if (cached !== undefined) {
      setVariant(cached as string);
      setIsLoading(false);
      return;
    }

    // Fetch from API
    fetch(`/api/ab-test/${testName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variants }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to get A/B test variant`);
        return res.json();
      })
      .then((data) => {
        const assignedVariant = data.variant as string;
        flagCache.set(cacheKey, assignedVariant);
        setVariant(assignedVariant);
        setError(null);
      })
      .catch((err) => {
        console.error(`Failed to get A/B test variant:`, err);
        setError(err as Error);
        // Default to control variant on error
        setVariant(variants[0] ?? "control");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [testName, variants.join(",")]);

  return { variant, isLoading, error };
}

/**
 * Clear feature flag cache
 * Useful for testing or after user logout
 */
export function clearFlagCache(): void {
  flagCache.clear();
}

/**
 * Prefetch feature flags
 * Call this early to load flags before they're needed
 */
export async function prefetchFlags(
  keys: FeatureFlagKey[]
): Promise<void> {
  try {
    const response = await fetch("/api/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
    });

    if (!response.ok) throw new Error("Failed to prefetch flags");

    const data = await response.json();
    const flags = data.flags as Record<string, boolean | string | number>;

    // Update cache
    for (const [key, value] of Object.entries(flags)) {
      flagCache.set(key, value);
    }
  } catch (error) {
    console.error("Failed to prefetch feature flags:", error);
  }
}
