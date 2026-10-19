# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file, fictitious-bank internal IT PMO Kanban demo/training tool. The whole app is `index.html` (markup + `<style>` + `<script>`). There is no build, lint, or test tooling. `package.json` exists only for dev tooling (the Playwright MCP server, and `docx` for the security report builder); the app has no dependencies.

- **Security scan:** the `security-scanner` agent (`.claude/agents/security-scanner.md`) uses the `cybersecurity-analyst` skill, writes findings JSON, and runs `node .claude/scripts/security-report.js <findings.json>` to produce `security-report_YYYY-MM-DD_HHMMSS.docx` in the root. Those reports are git-ignored: never commit them to this public repo.

- **Run:** open `index.html` directly in a browser (double-click; no server). Headless check: Playwright's Chromium is at `/opt/pw-browsers/chromium` (launch with `executablePath`, don't run `playwright install`).
- **Browser testing (Playwright MCP):** `.mcp.json` registers the `playwright` MCP server (pinned `@playwright/mcp@0.0.83`, `--isolated` so no profile is kept). It is installed as a devDependency: run `npm install` once (`node_modules/` is gitignored), and `npx` then uses the local copy. It is dev tooling only; nothing in `index.html` depends on it. Approve the server when Claude Code prompts, and use it on `file:///…/index.html`. In the cloud container add `--executable-path /opt/pw-browsers/chromium --headless --no-sandbox`; locally Playwright needs its Chromium (`npx playwright install chromium`).
- **Syntax check the script:** extract the `<script>` body and run `node --check` on it.

## Hard constraints (from the project brief — do not break)

- Vanilla HTML/CSS/JS only, all in the one file. No frameworks, bundler, runtime npm packages, CDN scripts, web fonts, or image files (system font stack, inline SVG/Unicode icons).
- **No persistence:** no localStorage/sessionStorage/IndexedDB/cookies. Refresh resets to seeded data by design (the UI footnote says so).
- A `Content-Security-Policy` meta tag in `<head>` allows only inline script/style and `connect-src https://formsubmit.co`. If `FORMSUBMIT_ENDPOINT` changes host, update `connect-src` too, or the email call is silently blocked.
- Only backend is FormSubmit's AJAX JSON endpoint (`FORMSUBMIT_ENDPOINT` in the script's CONFIG section). The email address must appear only in that constant and be sent nowhere else. FormSubmit failure must never break the board (try/catch in `handleSubmit`; card stays, warning toast shown).
- No `!important`; no `alert()`/`confirm()` (delete uses an inline Yes/No toggle; validation errors are inline).
- Branding: neutral "IT PMO" text wordmark and blue palette only — no real bank logo/trademarks. Task IDs (`UOB-ITPM-####`) and the email subject prefix are as specified in the brief.

## Architecture

State-driven render loop. `state = { tasks, filters, nextId, ui }` is the single source of truth; every change mutates `state` then calls `renderBoard()`, which rebuilds the entire board (and the header summary strip + filter count note) via `innerHTML`. Do not mutate card contents in the DOM directly.

- `state.ui` holds transient UI state that must survive a re-render: `moveOpenId` (card showing the Move select), `confirmDeleteId` (card showing Delete? Yes/No), `dragId`, and `focusKey`. After each render, `focusKey` is matched against `data-focus` attributes to restore keyboard focus, since the DOM was rebuilt — set `state.ui.focusKey` before calling `renderBoard()` when adding new controls.
- Event handling is **delegated** on `#board` (`wireDragAndDrop`, `wireCardActions`) because cards are re-created on every render. New card controls should use `data-action`/`data-id` and a case in the click handler rather than per-element listeners.
- Drag highlight (`.drop-target`, `.dragging`) is toggled directly as classes and cleared on `dragend`/re-render; drops and the keyboard "Move ▸" select both go through `moveTask()`.
- Filters (`applyFilters`) only affect what the board shows; the header summary counts, the Project progress panel (`renderProjects`/`projectStats`) and the Status update text (`buildStatusUpdate`) always use all of `state.tasks`.
- Project progress rows are toggle buttons (`aria-pressed`) that set `state.filters.project` and the `#filter-project` select together. They live outside `#board`, so focus restore (`focusKey`/`data-focus`) searches the whole document.
- Colours are CSS custom properties on `:root`, redefined under `@media (prefers-color-scheme: dark)`. Use the tokens (`--ink`, `--surface`, `--signal`, `--on-signal`, …) rather than raw hex so dark mode keeps working.
- Help chat widget (`#chat`, fixed bottom right) is outside the render loop: `openChat`/`closeChat` toggle it directly. The spoken greeting uses `speechSynthesis` in the browser (skipped if unsupported). It is not a Claude Code hook: hooks only fire on Claude Code events, never on clicks in the deployed page. The WhatsApp number lives in `WHATSAPP_NUMBER`/`WHATSAPP_DISPLAY`; the link opens with `rel="noopener noreferrer"`.
- Add Task validation: `showErrors` fills inline errors and the focused `#error-summary`; `validateOnBlur` re-checks a single field on `focusout`.
- All user strings go through `escapeHtml()` before entering template strings. Keep that for any new field.
- Add Task flow: `handleSubmit` → `validateTask` → `showErrors` → `addTask` (optimistic render) → `resetForm` → `notifyNewTask` (FormSubmit) → toast. The dialog is a native `<dialog>` kept open (button shows "Sending…") until the request settles.
- Each card's stage stepper comes from `renderStepper` using `STAGES` (Backlog, In Progress, Done). Blocked is not a stage: it renders on the In Progress step with the hatch swatch. If you add a status, decide where it sits in `STAGES`.
- Reference lists (`STATUSES`, `PROJECTS`, `CATEGORIES`, `PRIORITIES`) drive both the selects (`fillSelect` in `init`) and validation; edit them in one place. Priority/status styling relies on CSS classes derived from the lowercase priority (`prio-*`, `pill-*`).
- Seed tasks use dates relative to today (`dateString(offset)`) so overdue/upcoming items always exist; overdue = `dueDate` (local YYYY-MM-DD string) before today and status ≠ Done.
