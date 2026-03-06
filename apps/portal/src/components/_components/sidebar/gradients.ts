const JURISDICTION_GRADIENTS: Record<string, [string, string]> = {
  GG: ["#22d3ee", "#2563eb"],
  JE: ["#fb7185", "#f59e0b"],
  IM: ["#34d399", "#14b8a6"],
};

const FALLBACK_GRADIENTS: [string, string][] = [
  ["#60a5fa", "#4338ca"],
  ["#f472b6", "#db2777"],
  ["#4ade80", "#059669"],
  ["#fbbf24", "#ea580c"],
  ["#22d3ee", "#0ea5e9"],
];

export function getJurisdictionGradient(code: string, index: number): [string, string] {
  const direct = JURISDICTION_GRADIENTS[code.toUpperCase()];
  if (direct) {
    return direct;
  }

  return FALLBACK_GRADIENTS[index % FALLBACK_GRADIENTS.length] ?? ["#64748b", "#334155"];
}
