# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file, fictitious-bank internal IT PMO Kanban demo/training tool. The whole app is `index.html` (markup + `<style>` + `<script>`). There is no build, lint, or test tooling. `package.json` exists only to install the Playwright MCP dev tool (see below); the app has no dependencies.

- **Run:** open `index.html` directly in a browser (double-click; no server). Headless check: Playwright's Chromium is at `/opt/pw-browsers/chromium` (launch with `executablePath`, don't run `playwright install`).
- **Browser testing (Playwright MCP):** `.mcp.json` registers the `playwright` MCP server (pinned `@playwright/mcp@0.0.83`, `--isolated` so no profile is kept). It is installed as a devDependency: run `npm install` once (`node_modules/` is gitignored), and `npx` then uses the local copy. It is dev tooling only; nothing in `index.html` depends on it. Approve the server when Claude Code prompts, and use it on `file:///…/index.html`. In the cloud container add `--executable-path /opt/pw-browsers/chromium --headless --no-sandbox`; locally Playwright needs its Chromium (`npx playwright install chromium`).
- **Syntax check the script:** extract the `<script>` body and run `node --check` on it.

## Hard constraints (from the project brief — do not break)

- Vanilla HTML/CSS/JS only, all in the one file. No frameworks, bundler, runtime npm packages, CDN scripts, web fonts, or image files (system font stack, inline SVG/Unicode icons).
- **No persistence:** no localStorage/sessionStorage/IndexedDB/cookies. Refresh resets to seeded data by design (the UI footnote says so).
- Only backend is FormSubmit's AJAX JSON endpoint (`FORMSUBMIT_ENDPOINT` in the script's CONFIG section). The email address must appear only in that constant and be sent nowhere else. FormSubmit failure must never break the board (try/catch in `handleSubmit`; card stays, warning toast shown).
- No `!important`; no `alert()`/`confirm()` (delete uses an inline Yes/No toggle; validation errors are inline).
- Branding: neutral "IT PMO" text wordmark and blue palette only — no real bank logo/trademarks. Task IDs (`UOB-ITPM-####`) and the email subject prefix are as specified in the brief.

## Architecture

State-driven render loop. `state = { tasks, filters, nextId, ui }` is the single source of truth; every change mutates `state` then calls `renderBoard()`, which rebuilds the entire board (and the header summary strip + filter count note) via `innerHTML`. Do not mutate card contents in the DOM directly.

- `state.ui` holds transient UI state that must survive a re-render: `moveOpenId` (card showing the Move select), `confirmDeleteId` (card showing Delete? Yes/No), `dragId`, and `focusKey`. After each render, `focusKey` is matched against `data-focus` attributes to restore keyboard focus, since the DOM was rebuilt — set `state.ui.focusKey` before calling `renderBoard()` when adding new controls.
- Event handling is **delegated** on `#board` (`wireDragAndDrop`, `wireCardActions`) because cards are re-created on every render. New card controls should use `data-action`/`data-id` and a case in the click handler rather than per-element listeners.
- Drag highlight (`.drop-target`, `.dragging`) is toggled directly as classes and cleared on `dragend`/re-render; drops and the keyboard "Move ▸" select both go through `moveTask()`.
- Filters (`applyFilters`) only affect what the board shows; the header summary counts always use all of `state.tasks`.
- All user strings go through `escapeHtml()` before entering template strings. Keep that for any new field.
- Add Task flow: `handleSubmit` → `validateTask` → `showErrors` → `addTask` (optimistic render) → `resetForm` → `notifyNewTask` (FormSubmit) → toast. The dialog is a native `<dialog>` kept open (button shows "Sending…") until the request settles.
- Reference lists (`STATUSES`, `PROJECTS`, `CATEGORIES`, `PRIORITIES`) drive both the selects (`fillSelect` in `init`) and validation; edit them in one place. Priority/status styling relies on CSS classes derived from the lowercase priority (`prio-*`, `pill-*`).
- Seed tasks use dates relative to today (`dateString(offset)`) so overdue/upcoming items always exist; overdue = `dueDate` (local YYYY-MM-DD string) before today and status ≠ Done.
