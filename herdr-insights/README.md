# Insights

A native [Herdr](https://herdr.dev) dashboard for coding-agent token usage.
See which models you use, how usage changes over time, and your daily activity.
Reads local sessions from **Pi, Codex, Claude Code, and OpenCode**.

<img width="1204" height="538" alt="Tokens history" src="preview-history.png" />

![Insights](preview.png)

## Install

Ask your agent:
```
Read https://github.com/GaganSD/coding-agent-toolkit/blob/main/herdr-insights/INSTALL.md and install Insights following it.
```

Or install from a checkout:

```sh
git clone https://github.com/GaganSD/coding-agent-toolkit.git
cd coding-agent-toolkit
npm run install:local --prefix herdr-insights
```

With Herdr running, the installer checks the `insights` mod and adds an
**Insights** button beside the native tabs; clicking it reuses the current
space's dashboard tab, opening one only when absent. It installs `mods/insights/`
and records ownership in `data/insights/`. Shipped files, tabs, keys, terminals,
and usage data are unchanged. See [INSTALL.md](INSTALL.md) for the layout and
click-state rules. Set `HERDR_APP_HOME` to use a different app home.

## Use

- Compare models and providers with period filters and up/down trends.
- Explore a stacked usage chart, daily heatmap, lifetime totals, and streaks.
- Open **Settings** to choose sources, edit paths, toggle cached tokens, or
  change the palette and refresh interval.

## Subscription quotas (local fork)

The dashboard has an opt-in **Subscription quotas** card:

- **Connect Codex** queries `account/rateLimits/read` through your installed,
  signed-in Codex app-server. It uses the existing login, contacts the provider,
  and creates no chat, prompt, or inference request. API-key accounts may not
  expose subscription quotas. Disconnect stops future queries.
- **Connect Claude** backs up `~/.claude/settings.json` (or
  `$CLAUDE_CONFIG_DIR/settings.json`) and adds a status-line capture command.
  Existing status-line commands and options are preserved. Restart Claude Code
  and use a conversation to receive its `rate_limits` payload. The card shows
  the reported five-hour and seven-day usage; unsupported versions/accounts
  show **Unavailable**. Disconnect restores the original status-line setting,
  unless someone changed it meanwhile. Linked settings files are refused.
- **Refresh quotas** queries connected Codex accounts and rereads Claude's last
  capture. It cannot force Claude to emit a new payload. Quotas also refresh
  with the dashboard, normally every 60 seconds.
- Values are **Stale** after five minutes, a passed reset, or a failed query.
  Last-known values stay visible, labelled stale; no remaining allowance is
  inferred after a reset. Missing data is never treated as zero.

This is subscription quota reporting, not API cost estimation, API throughput
limits, or a live billing balance. Status-line backups sit beside Claude's
settings file. Quota cache/config files live in `data/insights/quota-*.json`
with mode `0600`. The Claude adapter stores only normalized quota percentages
and reset times, not the rest of the status-line payload.

The helper can also be exercised directly:

```sh
node mods/insights/quotas.mjs read --store "$HOME/.config/herdr-app/data/insights"
node scripts/check-quotas.mjs
```

## Privacy

Token analytics remain local. Optional Codex quota queries contact the provider
through your existing Codex login; Claude quotas come from its local status-line
payload. The mod reads session files and OpenCode's SQLite database, and writes
usage metadata to `~/.config/herdr-app/data/insights/insights.json`. It does not
store prompt or response text or modify source transcripts. No credential files
are read by this mod; Codex handles its own authentication.

## Development

One native mod, `mods/insights`, provides both views. A pane whose content is
`{mod: "insights", props: {mode: "toolbar"}}` renders only the button; any other
pane shows the dashboard. Toolbar mode starts no Node helper, scans, tasks,
timers, or editors. No layouts or key bindings ship; the button lives in a
personal layout clone composed by the installer, which wraps the native tabs
without modifying them (see [INSTALL.md](INSTALL.md)).

[RECIPE.md](RECIPE.md) is the self-contained rebuild brief required by Herdr.
Developer tests, fixtures, and release validation live outside this distribution;
see the repo's [development guide](../docs/herdr-insights-development.md). They are
not installation steps.
