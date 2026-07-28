# Final review fix report

Branch/worktree: `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server`

## Summary

Fixed all Important findings from the final whole-branch review for the Node.js + SQLite + Docker OmniWall migration.

## Fixes applied

1. `ctx.waitUntil()` no longer blocks HTTP responses in `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/src/app.js`.
   - The Worker response is now sent first.
   - `waitUntil` tasks are drained asynchronously after the response path with error logging.
   - `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/src/runtime/execution-context.js` now attaches rejection handlers immediately to avoid unhandled-rejection noise before the async drain.

2. Request/response body handling in `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/src/runtime/http-bridge.js` now has safer bounds and streaming behavior.
   - Added `RequestBodyTooLargeError` and a default request body cap of `1048576` bytes.
   - Added `MAX_REQUEST_BODY_BYTES` env parsing in `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/src/env.js`.
   - `src/app.js` maps oversized requests to `413 Request body too large` without invoking the Worker.
   - `sendWebResponse()` streams Web `Response.body` to Express when possible while preserving status, headers, and `set-cookie`; falls back to buffering for test/mocked responses.

3. Proxy trust defaults are now safe.
   - `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/src/env.js` defaults `TRUST_PROXY=false`.
   - `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/.env.example` documents `TRUST_PROXY=false` and when to enable it.
   - `nodeRequestToWebRequest()` no longer trusts `x-forwarded-proto` by default and strips `X-Forwarded-*` / `CF-Connecting-IP` headers from the Worker request unless `trustProxy` is enabled.
   - Reverse-proxy support remains available with `TRUST_PROXY=true`.

4. Deployment/admin docs now make HTTPS requirements explicit.
   - `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/docs/SERVER_DEPLOY.md` now describes HTTP as local smoke/demo only and HTTPS as required for production admin login/background-cookie features because cookies are `Secure`.
   - Nginx/Caddy examples are HTTPS-oriented.
   - `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/README.md` and `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/图床安装部署教程.md` were updated to point production users to HTTPS.

5. Scheduled jobs no longer overlap.
   - `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/src/jobs/scheduler.js` now has an `isRunning` guard and clears the startup timer on stop.

## Minor directly related fixes

- Added SQLite `busy_timeout = 5000` in `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/src/db/d1-sqlite.js`.
- Tightened integer env parsing in `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/src/env.js` so partial values such as `3000abc` do not parse as valid integers.

## Tests added/updated

- `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/tests/app.test.js`
  - waitUntil response is not delayed
  - request body cap returns 413
- `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/tests/http-bridge.test.js`
  - proxy headers are not trusted by default
  - oversized bodies are rejected
  - Web Response bodies stream to Express when possible
- `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/tests/env.test.js`
  - safe proxy/request-size defaults
  - strict integer parsing
- `/home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server/tests/scheduler.test.js`
  - scheduled maintenance does not overlap

## Commands and results

### Targeted tests

Command:

```bash
npm test -- tests/http-bridge.test.js tests/app.test.js tests/scheduler.test.js
```

Result:

```txt
Test Files  3 passed (3)
Tests       11 passed (11)
```

### Full test suite

Command:

```bash
npm test
```

Result:

```txt
Test Files  5 passed (5)
Tests       16 passed (16)
```

Final rerun after logger cleanup:

```txt
Test Files  5 passed (5)
Tests       16 passed (16)
```

### Local Node smoke

Initial smoke on port `3100` was blocked by an existing stale `node src/server.js` process listening on that port. The harness denied killing PID `101903`, so smoke was rerun on unused ports.

Final command:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=test-password-with-more-than-32-characters DATABASE_PATH=/tmp/omniwall-final-smoke-3202.sqlite PORT=3202 RUN_SCHEDULED_ON_START=false npm start
curl -i http://127.0.0.1:3202/docs | grep -m1 "HTTP/1.1 200 OK"
curl -s -H "Authorization: Bearer test-password-with-more-than-32-characters" http://127.0.0.1:3202/api/d1/init | grep '"ok": true'
```

Result:

```txt
server ready
HTTP/1.1 200 OK
"ok": true
```

Tracked background smoke task `b3bdzsyxy` was stopped successfully with `TaskStop`.

### Docker Compose config

A direct `docker compose config` failed because no project `.env` existed:

```txt
env file .../.env not found
```

Per the plan's smoke instructions, a temporary `.env` was generated from `.env.example` with a test admin password, `docker compose config` was run, and the generated `.env` was removed.

Command:

```bash
cp .env.example .env
# replace example ADMIN_PASSWORD with test-password-with-more-than-32-characters
docker compose -f docker-compose.yml --project-directory /home/ldl/omniwall-2/.claude/worktrees/node-sqlite-docker-server config
rm .env
```

Result: Compose config rendered successfully and included `TRUST_PROXY: "false"` and `MAX_REQUEST_BODY_BYTES: "1048576"`.

### Documentation checks

Command:

```bash
grep -n "SERVER_DEPLOY" README.md 图床安装部署教程.md
```

Result:

```txt
README.md:262:完整教程见 [`docs/SERVER_DEPLOY.md`](docs/SERVER_DEPLOY.md)。
图床安装部署教程.md:146:详细步骤见：[`docs/SERVER_DEPLOY.md`](docs/SERVER_DEPLOY.md)。
```

### Diff whitespace check

Command:

```bash
git diff --check
```

Result: passed with no output.

## Notes/concerns

- A stale process was still listening on port `3100` (`node src/server.js`, PID `101903`) during verification. The permission system denied stopping it because it was not tracked in the current resumed session. Required local smoke passed on port `3202` instead.
- Full Docker runtime smoke was not run; `docker compose config` was run successfully as the minimum required Docker validation after docs/default changes.
