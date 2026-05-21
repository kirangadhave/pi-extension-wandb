# pi-extension-wandb

A [pi coding agent](https://github.com/earendil-works/pi) extension that adds
[Weights & Biases Inference](https://wandb.ai/site/inference/) as a model
provider. Model list is discovered dynamically from W&B's OpenAI-compatible
`/v1/models` endpoint, so new models show up without code changes.

## Install

Get an API key from <https://wandb.ai/authorize>, then:

```bash
export WANDB_API_KEY=...               # required
export WANDB_PROJECT=team/project      # optional, recommended

pi install https://github.com/kirangadhave/pi-extension-wandb
```

Verify:

```bash
pi --list-models | grep wandb
```

## Use

```bash
pi --provider wandb --model deepseek-ai/DeepSeek-V3.1 "hello"
```

## Configuration

| Env var | Required | Notes |
| --- | --- | --- |
| `WANDB_API_KEY` | yes | From <https://wandb.ai/authorize>. If unset, the provider is silently skipped (no `wandb/*` models appear in `--list-models`). |
| `WANDB_PROJECT` | no\* | Sent as the `OpenAI-Project` header. Format: `team/project`. **If you belong to multiple W&B teams, set this explicitly** &mdash; otherwise W&B picks a default team for attribution, which can land usage on the wrong team. Single-team users can safely omit. |
| `WANDB_DEBUG` | no | `1` enables stderr logging from the extension (fetch errors, cache hits, etc.). |
| `WANDB_NO_CACHE` | no | `1` bypasses the model-list cache and fetches fresh on every pi startup. |

## How it works

On every pi startup the extension:

1. Reads `~/.cache/pi-extension-wandb/models.json` if it's fresh (< 1 hour old).
2. Otherwise fetches `https://api.inference.wandb.ai/v1/models` (5s timeout)
   and writes the result to the cache.
3. Registers each returned model under the `wandb` provider with
   `api: "openai-completions"`.

If the fetch fails and there is no usable cache, the provider is not
registered &mdash; `pi --list-models` will not show wandb models, and pi falls
back to its other configured providers cleanly.

## Known limitations

- **Context windows are guesses.** W&B's `/v1/models` doesn't expose limits.
  The extension hardcodes known windows for a handful of popular models
  (`KNOWN_CONTEXT_WINDOWS` in `index.ts`); everything else gets a default of
  128K. PRs to extend the map are welcome.
- **Reasoning detection is heuristic.** Substring match against the model id
  (`REASONING_MODEL_PATTERNS`). Edit the list for new families.
- **No cost tracking.** All models report zero cost. W&B publishes per-token
  pricing &mdash; PRs to encode it are welcome.
- **No provider-specific `compat` flags.** Some reasoning models (Qwen3
  thinking, gpt-oss, DeepSeek-R1) may need provider-specific quirks for
  thinking mode. If you hit a problem, open an issue with the model id and
  the exact failure.

## Contributing

PRs welcome. The only file you typically need to touch is `index.ts`:

- `KNOWN_CONTEXT_WINDOWS` &mdash; add accurate context sizes for new models.
- `REASONING_MODEL_PATTERNS` &mdash; add model family substrings that support
  reasoning/thinking.

For editor type-checking, after cloning:

```bash
pnpm install
pnpm check
```

pi loads `index.ts` directly at runtime (no build step).

## License

MIT &mdash; see [LICENSE](./LICENSE).
