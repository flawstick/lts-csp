export type OrgDemoModeSettings = {
  enabled: boolean;
  visibleClientNames: string[];
};

const DEFAULT_DEMO_MODE_SETTINGS: OrgDemoModeSettings = {
  enabled: false,
  visibleClientNames: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeDemoModeClientName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sanitizeDemoModeSettings(
  value: Partial<OrgDemoModeSettings> | null | undefined,
): OrgDemoModeSettings {
  const visibleClientNames = Array.isArray(value?.visibleClientNames)
    ? Array.from(
        new Map(
          value.visibleClientNames
            .filter((item): item is string => typeof item === "string")
            .map((item) => {
              const trimmed = item.trim().replace(/\s+/g, " ");
              return trimmed
                ? [normalizeDemoModeClientName(trimmed), trimmed]
                : null;
            })
            .filter(
              (entry): entry is [string, string] =>
                Array.isArray(entry) && entry.length === 2,
            ),
        ).values(),
      )
    : [];

  return {
    enabled: value?.enabled === true,
    visibleClientNames,
  };
}

export function parseOrgDemoModeSettings(
  settings: unknown,
): OrgDemoModeSettings {
  if (!isRecord(settings) || !isRecord(settings.demoMode)) {
    return DEFAULT_DEMO_MODE_SETTINGS;
  }

  return sanitizeDemoModeSettings({
    enabled: settings.demoMode.enabled === true,
    visibleClientNames: Array.isArray(settings.demoMode.visibleClientNames)
      ? settings.demoMode.visibleClientNames
      : [],
  });
}

export function mergeOrgDemoModeSettings(
  settings: Record<string, unknown> | null | undefined,
  demoMode: Partial<OrgDemoModeSettings> | null | undefined,
) {
  const nextSettings = isRecord(settings) ? { ...settings } : {};
  nextSettings.demoMode = sanitizeDemoModeSettings(demoMode);
  return nextSettings;
}

export function isDemoModeClientVisible(
  demoMode: OrgDemoModeSettings,
  entityName: string | null | undefined,
) {
  if (!demoMode.enabled) {
    return true;
  }

  const normalizedEntityName = entityName
    ? normalizeDemoModeClientName(entityName)
    : "";

  if (!normalizedEntityName) {
    return false;
  }

  const allowedClients = new Set(
    demoMode.visibleClientNames.map(normalizeDemoModeClientName),
  );

  if (allowedClients.size === 0) {
    return false;
  }

  return allowedClients.has(normalizedEntityName);
}
