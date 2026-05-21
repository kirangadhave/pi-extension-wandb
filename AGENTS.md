# AGENTS.md

Project-specific guidance for AI coding agents working in this repo. Read this
first if you're picking up a task here.

## What this is

A [pi coding agent](https://github.com/earendil-works/pi) extension that
registers Weights & Biases Inference as a model provider. The entire extension
is a single TypeScript file (`index.ts`) loaded directly by pi at runtime &mdash;
**there is no build step.**

## Layout

```
index.ts          - the whole extension; default export is the pi factory
package.json      - pi.extensions field tells pi how to load it
README.md         - user-facing install and config docs
LICENSE           - MIT
tsconfig.json     - editor type-checking only (no emit)
```

If you're tempted to add `src/` or `dist/` or a bundler &mdash; don't. pi loads
`index.ts` from disk on startup.

## Develop

```bash
pnpm install                          # editor types only; not needed at runtime
pi install ~/Projects/pi-extension-wandb   # or wherever you cloned
pi --list-models | grep wandb         # should list ~20+ models
```

Edit `index.ts`, then run `pi --list-models` again &mdash; no reinstall needed for
content changes (pi re-reads on each invocation).

## Verify changes

Type check:

```bash
pnpm check
```

Smoke test (requires `WANDB_API_KEY` and ideally `WANDB_PROJECT`):

```bash
pi -p --no-tools --provider wandb --model openai/gpt-oss-20b \
   "Reply with exactly the word PONG and nothing else."
```

Should print `PONG`. If you changed reasoning detection or context windows,
also check the model list output for the affected entries.

## Design constraints (do not break)

- **Dynamic discovery is the point.** The extension fetches `/v1/models` from
  W&B every cache TTL. Don't replace this with a hardcoded model list; that
  would make this repo worse than editing `~/.pi/agent/models.json` directly.
- **Zero runtime dependencies.** `index.ts` uses only `node:` built-ins
  (`fs`, `os`, `path`) and the global `fetch`. Don't add anything to
  `dependencies` &mdash; it would bloat every pi startup. `devDependencies` for
  editor types is fine.
- **Silent failure modes.** If `WANDB_API_KEY` is unset or `/v1/models` fails
  and there's no cache, the provider must not register. Don't fall back to a
  hardcoded list of models that won't actually work.
- **No `console.log` at startup.** Use the `log()` helper, which only emits
  when `WANDB_DEBUG=1` is set. pi's TUI gets unhappy with unexpected stderr.

## Conventions

- **Conventional commits**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- **No AI-authored / co-author / agent footers** in commit messages or PR
  descriptions.
- **Signed commits required.** GPG signing must work in your environment.
- **PR target**: `main`. Branch from `main`, name however you like for forks.

## Things that are deliberately heuristic

These get PRs to extend the data, not refactors to replace the heuristic:

- `REASONING_MODEL_PATTERNS` &mdash; substring match against model id. Add new
  reasoning families here.
- `KNOWN_CONTEXT_WINDOWS` &mdash; per-model context window. W&B's `/v1/models`
  doesn't return these, so we hardcode the ones we know. Add accurate values
  with a link to the model card in the PR description.

## Things to defer until there's demand

- Provider `compat` flags for reasoning models (`thinkingFormat: "deepseek"`
  etc.). Add when someone files an issue about a specific model.
- Cost data (`cost.input`, `cost.output`). Add when pi's spend tracking
  matters to a user.
- Weave tracing inside the extension. Tracing the LLM call alone doesn't help
  with agent-loop observability; the right place for that is pi itself, not
  this extension.

## Repo housekeeping

- This is a single-maintainer project right now. CI runs `pnpm check`
  on PRs.
- Issues / PRs welcome.
