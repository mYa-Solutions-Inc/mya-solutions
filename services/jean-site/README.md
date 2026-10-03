<!--
FILE / ROOT: services/jean-site/README.md
DESCRIPTION: What jean-site is, its privacy behaviour, configuration, local run, switching
  to a local model, one-time Google Cloud setup, deploy, and wiring the website to it.
-->

# jean-site

The backend for **Jean**, the guide on [myasolutions.org](https://myasolutions.org). A visitor asks a question; the service finds the relevant sections of the website, asks a language model to answer **only from those sections**, checks the result, and returns JSON. Jean can cite sections, offer to show one, or offer to draft an email. The website asks the visitor before doing either.

- Node 22, ES modules, **no npm dependencies**, no build step.
- The LLM provider can be swapped with an environment variable (Anthropic today, a local model later).
- If the model fails, the service returns an error (`503`). It never makes up an answer.

## How a request flows

1. `POST /ask` → CORS allowlist → per-IP rate limit → body ≤ 8 KB → shape validation.
2. **Retrieval** (`src/retrieve.js`): deterministic BM25 over heading, summary, text, page title and path. Sections on the visitor's current page get a boost, and so do the ids in `visible`. Visible sections of the current page are always included (max 4). The top 8 sections go to the model, each cut to about 1200 characters and labelled `[path#id]`.
3. Global daily cap check.
4. **Model** (`src/providers/*`): static system prompt (`src/prompt.js`) and one user message that holds the sections, plus the visitor's page, history and question as JSON-encoded data.
5. **Validation** (`src/validate.js`): pulls out the JSON reply. If the reply can't be parsed, the service retries **once** with a correction. A second failure returns `503 provider_error`. Sources and `show` targets must exist in the index, and `draft_email.to` must be on the allowlist. Anything else is dropped. Lengths are clamped and HTML/markdown is stripped. An empty answer is a failure.

## API

`POST /ask` with `{ question, page:{path,title}, visible:[id…], history:[{role:"user"|"jean", text}…] }`
→ `200 { answer, sources:[{path,id,heading}], action:null|{type:"show",…}|{type:"draft_email",…}, mode:"live" }`

| Status | Body |
|---|---|
| 400 | `{error:"bad_request", detail}` (invalid JSON or wrong shape) |
| 403 | `{error:"forbidden", detail}` (Origin not on the allowlist) |
| 404 / 405 | `{error:"not_found"}` / `{error:"method_not_allowed"}` |
| 413 | `{error:"payload_too_large", detail}` |
| 429 | `{error:"rate_limited", retryAfter}` and a `Retry-After` header |
| 503 | `{error:"unavailable", reason:"daily_limit"\|"provider_error"\|"index_unavailable"}` |

`GET /health` → `{ ok, provider, model, index:{sections, generated} }`. It returns 503 with `ok:false` until an index has loaded.
`OPTIONS` preflight → 204 for allowed origins.

## Privacy

- **No storage.** The service has no database and writes no files. Nothing about a visitor outlives the request, apart from in-memory rate-limit counters keyed by IP. Those hold only a token count and timestamp and are evicted when idle.
- **No content logging.** Question text, answers, history, page titles and IP addresses are never logged. Each request logs one JSON line with: `ts`, `severity`, `method`, `route`, `status`, `latency_ms`, `provider`, `model`, `input_tokens`, `output_tokens` (plus cache token counts when present), `retrieved` (number of sections sent), `attempts`, `error` (a reason code such as `rate_limited` or `provider_error:http_529`).
- The question and the retrieved site sections **are** sent to the configured model provider to produce the answer. With `anthropic`, that means Anthropic's API, under its data policies. With a local model nothing leaves your machine.
- Responses carry `Cache-Control: no-store`.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `JEAN_PROVIDER` | `anthropic` | `anthropic` \| `openai-compatible` |
| `JEAN_MODEL` | `claude-haiku-4-5-20251001` (anthropic) | **required** for `openai-compatible` |
| `ANTHROPIC_API_KEY` | — | required for `anthropic` (Secret Manager on Cloud Run) |
| `JEAN_TIMEOUT_MS` | `20000` | per model call |
| `JEAN_MAX_TOKENS` | `600` | |
| `JEAN_OPENAI_BASE_URL` | `http://localhost:11434/v1` | e.g. Ollama, llama.cpp, LM Studio, vLLM, MLX |
| `JEAN_OPENAI_API_KEY` | — | optional bearer token |
| `JEAN_OPENAI_JSON_MODE` | `0` | `1` sends `response_format: {type:"json_object"}` |
| `JEAN_INDEX_URL` | `https://myasolutions.org/assets/jean/site-index.json` | empty = use the bundled file only |
| `JEAN_INDEX_REFRESH_S` | `600` | if a refresh fails, the last good copy stays in use |
| `JEAN_INDEX_FILE` | `./site-index.json` | first-boot fallback (bundled into the image) |
| `JEAN_ALLOWED_ORIGINS` | `https://myasolutions.org,https://www.myasolutions.org` | exact match |
| `JEAN_DEV` | `0` | `1` also allows `http://localhost:*` / `127.0.0.1:*` |
| `JEAN_RATE_PER_MIN` / `JEAN_RATE_BURST` | `10` / `5` | token bucket per client IP |
| `JEAN_DAILY_LIMIT` | `2000` | questions per UTC day **per instance** |
| `JEAN_XFF_POSITION` | `first` | which `X-Forwarded-For` entry identifies the client (`first`\|`last`) |
| `JEAN_REQUEST_TIMEOUT_MS` | `30000` | whole-request timeout |
| `PORT` | `8080` | set by Cloud Run |

**Limits are per instance.** The rate limiter and the daily cap live in memory, so each Cloud Run instance counts separately and the counts reset on restart. `deploy.sh` sets `--max-instances 2`, so the most the service can answer in a day is `2 × JEAN_DAILY_LIMIT`.

## Run locally

```bash
cd services/jean-site
cp ../../assets/jean/site-index.json ./site-index.json   # or rely on JEAN_INDEX_URL
JEAN_DEV=1 ANTHROPIC_API_KEY=sk-ant-... npm start
curl -s localhost:8080/health
curl -s localhost:8080/ask -H 'content-type: application/json' \
  -d '{"question":"How much does lifetime cost?","page":{"path":"products/pricing.html","title":"Pricing"},"visible":[],"history":[]}'
```

Tests (no network, no API key): `npm test`. The end-to-end tests run against a clearly labelled **test double** provider (`test/doubles/provider-double.js`). It loads only when `NODE_ENV=test` and is left out of the container image.

## Switching to a local model

No code changes. Only environment variables. Example with [Ollama](https://ollama.com):

```bash
ollama pull llama3.1:8b
JEAN_PROVIDER=openai-compatible
JEAN_OPENAI_BASE_URL=http://localhost:11434/v1
JEAN_MODEL=llama3.1:8b
JEAN_OPENAI_JSON_MODE=1
```

Run those as `JEAN_DEV=1 JEAN_PROVIDER=openai-compatible JEAN_OPENAI_BASE_URL=http://localhost:11434/v1 JEAN_MODEL=llama3.1:8b JEAN_OPENAI_JSON_MODE=1 npm start`. The same variables work for llama.cpp `llama-server` (`http://localhost:8080/v1`), LM Studio (`http://localhost:1234/v1`), vLLM and MLX servers. Point `JEAN_OPENAI_BASE_URL` at the server's `/v1`. Small local models are less reliable at strict JSON. Turn on `JEAN_OPENAI_JSON_MODE=1` if your server supports it. Any `<think>…</think>` reasoning blocks are removed before parsing.

### Adding a provider

Adding a provider takes one file and one line:

1. Create `src/providers/<name>.js` exporting `createProvider(config)`, which returns
   `{ name, model, async complete({ system, messages, maxTokens, signal }) → { text, usage:{ inputTokens, outputTokens } } }`.
   Throw `ProviderError` on failure. `fetchWithTimeout` and `errorFromResponse` in `src/providers/index.js` handle timeouts and HTTP errors.
2. Add `'<name>': () => import('./<name>.js'),` to `REGISTRY` in `src/providers/index.js`.
3. Set `JEAN_PROVIDER=<name>` (add any new settings to `src/config.js`).

## One-time Google Cloud setup

```bash
PROJECT=your-project-id
REGION=us-west1
gcloud config set project "$PROJECT"

# APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

# The Anthropic key, read from stdin so it never lands in shell history or a file
read -rs ANTHROPIC_KEY && printf '%s' "$ANTHROPIC_KEY" | \
  gcloud secrets create jean-site-anthropic-key --replication-policy=automatic --data-file=-
unset ANTHROPIC_KEY

# Let the Cloud Run runtime service account read it (default compute SA unless you set another)
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
gcloud secrets add-iam-policy-binding jean-site-anthropic-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

To rotate the key: `printf '%s' "$NEW_KEY" | gcloud secrets versions add jean-site-anthropic-key --data-file=-`, then redeploy, or wait for new instances to start, since they pick up `:latest`.

## Deploy

```bash
cd services/jean-site
PROJECT=your-project-id ./deploy.sh
```

`deploy.sh` first **copies `../../assets/jean/site-index.json` into this folder**. The Dockerfile bundles that copy as the first-boot fallback, and the build fails if it's missing. Then it runs `gcloud run deploy jean-site --source . --region us-west1 --allow-unauthenticated --max-instances 2 --memory 256Mi …` with the env vars, and binds `ANTHROPIC_API_KEY` from the secret. At runtime the service still fetches the live index from `JEAN_INDEX_URL` every 10 minutes, so content updates to the site reach Jean without a redeploy.

## Point the website at the service

The site reads the endpoint from `assets/js/jean-config.js`:

```js
window.JEAN_ENDPOINT = "https://jean-site-xxxxxxxx-uw.a.run.app";
```

Use the URL that `deploy.sh` prints. That file belongs to the website, not to this service.

## Notes

- **Prompt caching.** The Anthropic provider marks the static system prompt with `cache_control: {type: "ephemeral"}`. The prompt is currently about 3.4 KB, which is likely below the minimum cacheable length for Haiku-class models. In that case the API processes it normally without caching, and `cache_read_tokens` stays 0 in the logs. This is harmless. Caching starts to pay off automatically if the static prompt grows.
- **Client IP.** By default the service uses the first `X-Forwarded-For` entry. A client can put its own value there, which lets it rotate keys to dodge the per-IP limit. The daily cap still bounds total cost. If you put a Google load balancer in front, check where the real client IP sits in the header and set `JEAN_XFF_POSITION` to match.
