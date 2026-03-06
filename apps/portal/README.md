# LTS Portal

Client-facing portal for trust users, with org-scoped access and returns workspace.

## Run

From repo root:

```bash
bun run dev:portal
```

## Shad Steps

Use a one-time command to pull any component directly into your project.

React Bits supports two CLI installation methods: `shadcn` and `jsrepo`.
Pick whichever you prefer. Both fetch the same component source.

Installation command template:

```bash
npx shadcn@latest add https://reactbits.dev/r/<Component>-<LANG>-<STYLE>
```

`<LANGUAGE> + <STYLE>` combinations:

- `JS-CSS` - JavaScript + Plain CSS
- `JS-TW` - JavaScript + Tailwind
- `TS-CSS` - TypeScript + Plain CSS
- `TS-TW` - TypeScript + Tailwind

Example:

```bash
npx shadcn@latest add https://reactbits.dev/r/SplitText-TS-TW
```
