# codex-reset-checker

Tiny zero-dependency CLI for checking local Codex rate-limit reset credits.

It reads `tokens.access_token` from `~/.codex/auth.json`, calls:

```text
https://chatgpt.com/backend-api/wham/rate-limit-reset-credits
```

and prints only:

- `available_count`
- each credit's `status`
- each credit's `title`
- each credit's `granted_at`
- each credit's `expires_at`

It does not print access tokens, refresh tokens, cookies, or IDs.

## Usage

Run it directly:

```bash
npx codex-reset-checker
```

Example output:

```text
Codex reset credits
Available: 3 resets
Timezone: Asia/Shanghai

#  Status     Expires              Granted              Title
-  ---------  -------------------  -------------------  --------------------------
1  available  2026-07-18 08:38:59  2026-06-18 08:38:59  Full reset (Weekly + 5 hr)
2  available  2026-07-27 07:50:13  2026-06-27 07:50:13  Full reset (Weekly + 5 hr)
3  available  2026-08-01 03:08:55  2026-07-02 03:08:55  Full reset (Weekly + 5 hr)
```

## Advanced usage

From a local checkout:

```bash
npx .
```

JSON output:

```bash
npx codex-reset-checker --json
```

Use a specific timezone:

```bash
npx codex-reset-checker --timezone Asia/Shanghai
```

Use a custom auth file:

```bash
npx codex-reset-checker --auth-file ~/.codex/auth.json
```

If the API returns `401`, the CLI reports that the credential is expired or the
Authorization header was not accepted.
