# Agent Instructions

## Package Manager

- Prefer `bun` for package management and script execution in this repository.
- Use `bun install` instead of `pnpm install`.
- Use `bun run <script>` instead of `pnpm <script>` or `pnpm run <script>`.
- Use `bun x <tool>` for one-off CLI tools when possible.
- For workspace-specific commands, `cd` into the target app/package/container and run `bun` there.
- Avoid `pnpm` unless Bun cannot perform the task or the user explicitly asks for `pnpm`.
