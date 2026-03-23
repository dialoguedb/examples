# DialogueDB Examples

Each directory is a self-contained integration example showing how to use DialogueDB with a specific SDK or framework.

## Mindset

This repo is the first code a developer sees when evaluating DialogueDB. Every example is a representation of the product and the team behind it. If the code looks sloppy, developers assume the product is too. Write examples you'd be proud to put in front of a senior engineer who's deciding whether to adopt DialogueDB.

## Code Standards

These are examples that developers will copy-paste. They need to be clean.

- **No type casting.** No `as unknown as`, no `as any`, no `as string`. If the types don't work, fix the approach — don't lie to TypeScript.
- **No `any`.** Type everything properly.
- **No `// @ts-ignore` or `// @ts-expect-error`.**
- **No `new Function()` or `eval()`.** Not even in demos.
- **Keep it minimal.** Show the pattern, not boilerplate. If an example needs 300+ lines, split it into multiple files.
- **Handle errors.** Don't let promises float. Don't swallow exceptions.
- **Clean up after yourself.** Examples that create dialogues should delete them at the end.

## Structure

Every example directory must have:

- `package.json` — correct dependencies, working scripts
- `tsconfig.json` — strict mode
- `.env.example` — all required env vars, no real keys
- `README.md` — what it does, setup, how to run
- `src/` — working TypeScript that compiles cleanly (`npx tsc --noEmit`)

## DialogueDB SDK

The `dialogue-db` SDK's `content` field accepts `string | object | array`. You don't need to cast objects to strings — just pass them directly.

Read the SDK before writing examples:
```
npm view dialogue-db readme
```

## Verification

Before calling anything done:
```bash
cd <example-dir>
npm install
npx tsc --noEmit
```

If it doesn't compile clean, it's not done.
