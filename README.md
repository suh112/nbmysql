<div align="center">

# 🗄️ nbmysql

**A TypeScript-first MySQL wrapper for FiveM — with self-invalidating cache, request coalescing, per-resource cost attribution, and built-in migrations.**

[![License: LGPL-3.0](https://img.shields.io/badge/License-LGPL%20v3-blue.svg)](https://www.gnu.org/licenses/lgpl-3.0)
[![FiveM](https://img.shields.io/badge/FiveM-Ready-orange?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PC9zdmc+)](https://fivem.net)
[![Node.js](https://img.shields.io/badge/Node.js-22-green?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://typescriptlang.org)
[![mysql2](https://img.shields.io/badge/mysql2-3.x-teal?logo=mysql)](https://www.npmjs.com/package/mysql2)

</div>

---

## ✨ What makes it different

| Feature | nbmysql | oxmysql |
|---|---|---|
| Self-invalidating query cache | ✅ | ❌ |
| Request coalescing | ✅ | ❌ |
| Per-resource cost attribution | ✅ | ❌ |
| Built-in SQL migration runner | ✅ | ❌ |
| Exponential-backoff retry | ✅ | ❌ |
| TypeScript source | ✅ | ✅ |
| oxmysql-compatible API | ✅ | — |

### 🔄 Self-invalidating cache
`MySQL.cached()` caches a read result and **automatically evicts it** the moment any `INSERT` / `UPDATE` / `DELETE` / `transaction` touches a table the query read from. Table names are extracted straight from the SQL string — no manual key management, no stale reads.

### ⚡ Request coalescing
If ten resources fire the exact same query with the same params simultaneously, **only one database round trip happens**. Every caller receives the same resolved result. This is a silent, automatic win for hot queries.

### 📊 Per-resource cost attribution
Every query is stamped with `GetInvokingResource()`. `MySQL.stats()` and the `/nbmysql:stats` server console command show you exactly which resource is hammering your database, its average query time, slow-query count, and error rate — not just a meaningless global number.

### 🗃️ Built-in migrations
Drop numbered `.sql` files in `migrations/`. They run **once, in order**, tracked in an auto-created `nbmysql_migrations` table, on resource start or on demand via `/nbmysql:migrate`. No external tool needed.

### 🔁 Automatic retry with backoff
Transient errors (`PROTOCOL_CONNECTION_LOST`, `ECONNRESET`, `ETIMEDOUT`, `ER_CON_COUNT_ERROR`) are retried up to 3 times with exponential backoff before the query fails.

---

## 📦 Installation

### Pre-built (recommended)

1. Download the [latest release](https://github.com/nullbound/nbmysql/releases) and extract to your `resources/` folder.
2. Add to `server.cfg` **before** any resource that uses it:

```cfg
set mysql_connection_string "mysql://user:password@localhost/database"
ensure nbmysql
```

### Build from source

```bash
git clone https://github.com/nullbound/nbmysql
cd nbmysql
npm install
npm run build     # bundles src/server.ts → dist/server.js
```

---

## ⚙️ Configuration

All options are set as convars in `server.cfg`:

```cfg
set mysql_connection_string "mysql://user:password@localhost/database"

# Optional tuning (these are the defaults)
set nbmysql_pool_size      "10"    # connection pool size
set nbmysql_slow_query_ms  "150"   # warn threshold in milliseconds
set nbmysql_max_retries    "3"     # retries on transient errors
set nbmysql_cache_ttl_ms   "5000"  # default cached query TTL
set nbmysql_debug          "false" # verbose logging
set nbmysql_version_check  "true"  # warn in console when a new GitHub release is out
```

---

## 🔌 Usage

Add the library to your resource's manifest:

```lua
-- fxmanifest.lua
server_scripts {
    '@nbmysql/lib/init.lua',
    'server/**/*.lua'
}
```

### API reference

```lua
-- ─── Reads ───────────────────────────────────────────────────────────────────

-- Returns all matching rows
local rows = MySQL.query('SELECT * FROM players WHERE job = ?', { job })

-- Cached read — re-queries automatically when the table is written to
-- Optional third arg overrides the default TTL (ms)
local items = MySQL.cached('SELECT * FROM shop_items', {}, 10000)

-- First column of first row (great for COUNT, SUM, etc.)
local count = MySQL.scalar('SELECT COUNT(*) FROM players')

-- First row or nil
local player = MySQL.single('SELECT * FROM players WHERE id = ?', { id })

-- ─── Writes ──────────────────────────────────────────────────────────────────

-- Returns insertId
local newId = MySQL.insert('INSERT INTO players (name, job) VALUES (?, ?)', { name, job })

-- Returns affectedRows
local affected = MySQL.update('UPDATE players SET job = ? WHERE id = ?', { job, id })

-- ─── Transactions ────────────────────────────────────────────────────────────

local ok = MySQL.transaction({
    { query = 'UPDATE accounts SET balance = balance - ? WHERE id = ?', params = { amount, fromId } },
    { query = 'UPDATE accounts SET balance = balance + ? WHERE id = ?', params = { amount, toId } },
})

-- ─── Utilities ───────────────────────────────────────────────────────────────

-- Run after startup
MySQL.ready(function()
    print('Database is connected and ready')
end)

-- Per-resource statistics
local stats = MySQL.stats()
-- { my_resource = { queries = 412, totalMs = 891.2, slowQueries = 3, errors = 0, avgMs = 2.16 } }

-- Force-clear the entire query cache
MySQL.clearCache()
```

### Callback style

All methods also accept a trailing callback for non-blocking usage:

```lua
MySQL.Async.query('SELECT * FROM players', {}, function(rows)
    print(#rows .. ' players found')
end)

MySQL.Async.insert('INSERT INTO logs (msg) VALUES (?)', { 'hello' }, function(id)
    print('Inserted with id ' .. id)
end)
```

---

## 🗃️ Migrations

Place numbered SQL files in the `migrations/` folder inside your resource:

```
migrations/
├── 0001_create_players.sql
├── 0002_add_job_column.sql
└── 0003_create_vehicles.sql
```

Files run **once, in order**, on resource start. Completed migrations are tracked in `nbmysql_migrations` and never re-run. Trigger manually from the server console:

```
nbmysql:migrate
```

---

## 🔬 Console commands

| Command | Description |
|---|---|
| `nbmysql:stats` | Print per-resource query cost breakdown as JSON |
| `nbmysql:migrate` | Run any pending migrations immediately |
| `migratesql` | Dry-run: list files that would change when migrating from oxmysql |
| `migratesql apply` | Rewrite oxmysql references to nbmysql (backs up originals as `.nbmysql.bak`) |
| `migratesql revert` | Restore every `.nbmysql.bak` backup |

---

## 🚚 Migrating from oxmysql

No data moves — both wrappers use the same database. Only your Lua `require`/`@`-paths change.

From the **server console** (or txAdmin live console):

```
migratesql            # preview what will change
migratesql apply      # rewrite + backup
migratesql revert     # undo if needed
```

**What gets rewritten automatically:**
- `@oxmysql/lib/MySQL.lua` → `@nbmysql/lib/init.lua`
- `'oxmysql'` in `fxmanifest.lua` → `'nbmysql'`
- `exports.oxmysql` / `exports['oxmysql']` / `GetResourceState('oxmysql')` in Lua

**What gets flagged for manual review** (not supported by nbmysql):
`MySQL.Sync.*`, `MySQL.Async.fetchAll/execute`, `*_async` exports, `rawExecute`

After `apply`, swap `ensure oxmysql` for `ensure nbmysql` in `server.cfg` and restart.

> `MySQL.query.await(...)`, `MySQL.query(q, params, cb)`, and `MySQL.ready(cb)` behave identically to oxmysql.

---

## 🏗️ Architecture

```
nbmysql/
├── fxmanifest.lua          Lua 5.4 manifest, declares node_version 22
├── config.lua              Convar-driven configuration (shared)
├── lib/
│   └── init.lua            LuaCATS-typed MySQL global, shared via files{}
├── migrations/             Versioned .sql files, auto-run on start
├── server/
│   └── console.lua         Lua-side console command helpers
└── src/
    ├── server.ts            Entry point — registers exports & console commands
    ├── pool.ts              mysql2 connection pool init
    ├── query.ts             query / scalar / single / insert / update / transaction
    ├── cache.ts             Self-invalidating in-process cache
    ├── coalesce.ts          In-flight request deduplication
    ├── stats.ts             Per-resource cost attribution
    ├── migrations.ts        SQL migration runner
    ├── fingerprint.ts       Query hashing + table-name extraction
    ├── logger.ts            Console logging helpers
    └── types.ts             Shared TypeScript types
```

---

## 📝 Events

| Event | Payload | Description |
|---|---|---|
| `nbmysql:ready` | — | Fired once the connection pool is established |
| `nbmysql:connectionError` | `message: string` | Fired if startup fails |
| `nbmysql:migrationApplied` | `file: string` | Fired after each successful migration |
| `nbmysql:migrationFailed` | `file: string, message: string` | Fired if a migration throws |

---

## 🐛 Troubleshooting

### `SyntaxError: Identifier '_i' has already been declared`

FiveM runs all `node_version` resources in a **shared V8 context**. When esbuild minifies a CJS bundle without an IIFE wrapper, its short minified identifiers (`_i`, `_r`, …) land at global scope and collide with identifiers from other resources.

**Fix** — wrap your bundle in an IIFE by updating `esbuild.mjs`:

```js
const options = {
    // ... your existing options ...
    banner: { js: '(function(){"use strict";' },
    footer: { js: '})();' },
};
```

Rebuild with `npm run build` and restart the resource. The fixed `esbuild.mjs` is included in the repository root.

---

## 📄 License

[LGPL-3.0-or-later](LICENSE) — use freely in closed-source servers; modifications to nbmysql itself must be shared.

---

<div align="center">

Made with ❤️ by **nullbound (aj)**

</div>
