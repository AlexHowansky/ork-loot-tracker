# Phat Loot

A web app for tracking loot in tabletop role-playing games. The GM records
the loot the party finds, session by session. Players claim the pieces they
want, and when the party sells off the rest, the app splits the proceeds by
shares, taking each character's claims out of what they're owed.

![A campaign's loot table, with split totals above it](example.webp)

## Features

* GM accounts, with campaigns, sessions, characters and loot.
* Players join with a one-time code that ties them to one character. No
  account or password is needed, and one browser can hold several characters.
* Players claim available loot, including part of a stack, and can release their
  claims. The GM can claim or release on a character's behalf.
* Split preview and history. Each character's share, claims and payout are
  shown, and any remainder that doesn't divide evenly goes to petty cash.
* Each campaign has its own currency label and decimal places. Amounts are
  stored as integers, so there are no rounding errors.
* Optional campaign background images.

The full specification is in [SPEC.md](SPEC.md), and the architecture and
conventions are in [CLAUDE.md](CLAUDE.md).

## Stack

[Bun](https://bun.sh), TypeScript, React, TanStack Query, React Router,
Drizzle ORM on SQLite, zod, Tailwind CSS with daisyUI, and Font Awesome.

## Getting started

You'll need [Bun](https://bun.sh) installed.

```sh
bun install
bun run gm create <email>      # create a GM account
bun run dev                    # http://localhost:3000
```

Database migrations are applied automatically on startup. Browser hot module
reloading is off, so refresh the page after changing client code.

## Docker

```sh
docker build -t phat-loot .
docker run -d --name phat-loot -p 3000:3000 \
  -v phat-loot-data:/app/data --env-file .env.production phat-loot
docker exec -it phat-loot gm create <email>
```

The image holds only the bundled app (`bun run build`) and its migrations,
with no `node_modules`. It runs in production mode, so set `APP_URL` (and
the `SMTP_*` variables to send mail). The database and uploads live in the
`/app/data` volume. Run a single container per database, since live
updates are delivered in-process.

## Reverse proxy

To serve the app over HTTPS, put a reverse proxy such as
[Caddy](https://caddyserver.com) in front of it. Caddy obtains and renews
the TLS certificate itself. A minimal `Caddyfile`:

```caddyfile
loot.example.com {
	reverse_proxy localhost:3000
}
```

Caddy passes the client's address in `X-Forwarded-For` and streams the
Server-Sent Events that keep campaign pages live without extra settings.
Run the app with `APP_URL=https://loot.example.com` and `TRUST_PROXY=1`,
and make it reachable only through Caddy, for example by publishing the
container's port on loopback alone (`-p 127.0.0.1:3000:3000`). Otherwise
a client could connect directly and forge its own `X-Forwarded-For`.

## Scripts

| Command                         | Purpose                                  |
| ------------------------------- | ---------------------------------------- |
| `bun run dev`                   | Start the server with hot reload         |
| `bun run start`                 | Start the server in production mode      |
| `bun run build`                 | Bundle server, client and CLI into `dist/` |
| `bun run gm create <email>`     | Create a GM account                      |
| `bun run gm passwd <email>`     | Change a GM's password                   |
| `bun run gm list`               | List GM accounts                         |
| `bun test`                      | Run the unit, API and UI-rule tests      |
| `bun run typecheck`             | Type-check with tsc                      |
| `bun run db:generate`           | Generate a migration after a schema change |

The `gm` commands prompt for a password. Set `GM_PASSWORD` to supply it
without a prompt.

## Configuration

The server reads these environment variables:

| Variable         | Default          | Purpose                                    |
| ---------------- | ---------------- | ------------------------------------------ |
| `PORT`           | `3000`           | HTTP port                                  |
| `DB_PATH`        | `data/app.db`    | SQLite database file                       |
| `UPLOAD_DIR`     | `data/uploads`   | Where campaign images are stored           |
| `LOG_LEVEL`      | `info`           | Logging verbosity                          |
| `NODE_ENV`       |                  | `production` turns on secure cookies and JSON logs |
| `SECURE_COOKIES` |                  | Set to `1` for secure cookies outside production |
| `TRUST_PROXY`    | `0`              | Number of reverse proxies in front of the app; when set, client IPs come from `X-Forwarded-For` |

The `data/` directory is not committed.

## Project layout

```
src/client/   React SPA (pages, components, API client)
src/server/   Bun.serve app, routes, domain logic, database
src/shared/   zod schemas, types and money helpers shared by both sides
src/cli/      GM account management
drizzle/      SQL migrations
test/         bun:test suites
```

## License

[MIT](LICENSE)
