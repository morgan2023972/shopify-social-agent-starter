# Copilot Instructions

Keep context small. Read only the file you will change plus one directly related file if needed.

## Repo Scope

- Node.js + TypeScript CLI.
- Flow: read X posts -> score -> generate variants -> queue -> approve -> publish.
- Queue and state are JSON files in `data/`.

## Work Rules

- Make minimal, local changes. Avoid broad refactors.
- Reuse existing types and utilities before adding new ones.
- Preserve JSON formats unless the task explicitly requires a schema change.
- Do not add dependencies unless required.

## Safety

- Never hardcode secrets or modify `.env`.
- Keep `DRY_RUN=true` as the default-safe behavior.
- Do not make publishing more permissive by default.
- Treat `data/` as user data; avoid destructive edits unless requested.

## Primary Files

- `src/index.ts`: CLI entry
- `src/jobs/daily.ts`: queue generation
- `src/agents/`: scoring and comment generation
- `src/queue/queueService.ts`: queue logic
- `src/publish/publishApproved.ts`: publishing
- `src/platforms/xClient.ts`: X integration
- `src/storage/jsonStore.ts`: JSON persistence
- `src/types.ts`: shared types

## Validation

- After TypeScript edits, run `npm run typecheck`.
- If behavior changes, run the most relevant test in `tests/`.
- Update `README.md` only if commands, config, or queue format change.
