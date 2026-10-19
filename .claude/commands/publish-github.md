---
description: Push this project to GitHub, write the README and About section, enable Pages, add CI/CD, and run a security scan
argument-hint: <github-repo-url or owner/repo> [branch=main]
---

Publish this project to GitHub. The user supplies the GitHub info in `$ARGUMENTS` (repo URL or `owner/repo`, optional branch, default `main`). If it is missing or ambiguous, ask for it once before doing anything else.

Work through the steps in order. Do the security scan (step 7) BEFORE the first push, and again before the final push. Report each step as done, skipped, or blocked, with the reason.

## 0. Preflight
- Parse `owner/repo` from `$ARGUMENTS`. Confirm the repo is attached to this session; if not, call `add_repo` (access `push`) and follow its clone instructions. Never create credentials or tokens yourself.
- Run `git status`, `git remote -v`, and `gh auth status`. If `gh` is unauthenticated or the proxy returns 403 for a GitHub API path, do not retry in a loop: mark that step "manual" and give the user the exact UI steps (see steps 3, 4, 6).
- Never force-push. Never rewrite history on a branch the user did not create in this session.

## 1. Security scan (gate)
This is a single-file, no-backend, no-storage demo. Verify, and stop on any failure:
- **Secrets:** grep the tree (excluding `.git`) for tokens/keys/passwords: `ghp_`, `github_pat_`, `AKIA`, `AIza`, `sk-`, `-----BEGIN`, `password`, `secret`, `api[_-]?key`, `Authorization`, and `.env` files. Nothing may match.
- **Only allowed outbound call:** the only network request in the app is the FormSubmit AJAX call in `notifyNewTask`. Grep for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `import(`, `<script src`, `<link href="http`, `<img src="http`, `@import`, `url(http` and confirm nothing else loads or sends data to the internet. No CDN, web fonts, analytics, or trackers.
- **No storage:** grep for `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`. Must be zero.
- **Email address:** it may appear ONLY in the `FORMSUBMIT_ENDPOINT` constant. Grep the whole repo (README, CLAUDE.md, workflows, commit messages) for it and for any other personal email; remove stray copies. Warn the user that the endpoint is visible in a public repo's source.
- **Unsafe patterns:** no `eval`, `new Function`, `document.write`, or unescaped user input in `innerHTML` (every user string goes through `escapeHtml`). No `!important`, `alert(`, `confirm(`.
- **Files:** `git ls-files` must contain only intended project files. Make sure no scratch files, screenshots, or editor/OS junk are tracked; add a `.gitignore` if needed.
- Syntax check: extract the `<script>` body and run `node --check`.
Print a short findings table (check, result). If anything fails, fix it or stop and ask; do not push.

## 2. Push the code
- Commit with clear messages (follow the commit attribution lines from the session's system reminder).
- `git push -u origin <branch>`; on network errors only, retry up to 4 times with 2s/4s/8s/16s backoff.

## 3a. Screenshot (do this before writing the README)
Capture the app and save it as `docs/screenshot.png` (the only image file allowed in the repo; never reference it from `index.html`).
- Prefer the Playwright MCP tools (`mcp__playwright__*`, from `.mcp.json`; load them with ToolSearch "playwright"). Navigate to the live Pages URL if reachable. Otherwise serve the repo locally (`python3 -m http.server 8765 --bind 127.0.0.1` in the background, kill it afterwards) and open `http://localhost:8765/index.html`: the MCP server blocks `file://` URLs and would silently screenshot a blank page. Check `browser_navigate` did not return an error, resize the viewport to 1400x820, wait for the cards to render, then take a viewport screenshot. Write it to a scratch path first (not straight over `docs/screenshot.png`), view it, and only copy it into `docs/` once it shows the board (a blank capture is about 5 KB).
- If the MCP tools are not available in this session (servers connect only at session start), fall back to the Playwright library with the preinstalled Chromium (`executablePath: '/opt/pw-browsers/chromium'`; never run `playwright install`): launch headless, same viewport, wait for `.card`, `page.screenshot({ path: 'docs/screenshot.png' })`, and check there were no `pageerror` events.
- Open the PNG and confirm it shows all four columns with cards and no error state. Keep it under about 300 KB. Reshoot whenever the UI changes.
- Security: the screenshot must show only the seeded demo data. Do not capture the Add Task dialog with real input, and never the email address or any browser chrome.

## 3. README
Create or update `README.md` (keep any accurate existing content, fix what is stale). Include:
- Title and one-line description, then the screenshot from step 3a: `![IT PMO Project Board screenshot](docs/screenshot.png)` right under the live demo link.
- **Tech badges** (static shields.io-style badge links are the one allowed use of an external image, in the README only, never in `index.html`): HTML5, CSS3, JavaScript (vanilla, no framework), GitHub Pages, GitHub Actions, FormSubmit.
- Live demo link (the Pages URL, `https://<owner>.github.io/<repo>/`).
- Features (Kanban columns, drag and drop, keyboard move, filters, add-task form, email notification).
- **How to install:** no install; `git clone <url>` or download `index.html`. State there are no dependencies, no build, no npm.
- **How to run:** double-click `index.html`, or optionally serve it locally with `python3 -m http.server 8000` and open `http://localhost:8000`.
- **Configuration:** how to set `FORMSUBMIT_ENDPOINT`, plus the one-time FormSubmit activation email. Use a placeholder (`YOUR_EMAIL@example.com`) in docs, never the real address.
- Notes: data lives in memory only and resets on refresh (what would be needed for persistence: a backend/database); fictitious bank demo, no real branding.
- License line only if a LICENSE file exists.

## 4. GitHub About section (description, topics, website)
Prefer the API: `gh repo edit <owner>/<repo> --description "<one line>" --add-topic html,css,javascript,kanban,project-management,github-pages,github-actions,vanilla-js --homepage "<pages-url>"`.
If the API is blocked, give the user the exact values to paste under the repo's gear icon next to About (description, website, topics). Set the website to the Pages URL once step 5 is done.

## 5. GitHub Pages
- Preferred: enable via the Actions-based deployment in step 6 (Pages source "GitHub Actions"), or branch deploy from `<branch>` / root.
- Via API: `gh api -X POST repos/<owner>/<repo>/pages -f 'source[branch]=<branch>' -f 'source[path]=/'` (use `build_type=workflow` if using Actions). If blocked or 403, tell the user: Settings → Pages → Source → Deploy from a branch → `<branch>` / `(root)` → Save (or "GitHub Actions" if using the workflow).
- A site is not live until a build runs after the setting is saved: push a trivial commit if none ran. Verify the URL only if the network allows it; otherwise say it is unverified.
- Remember Pages on a private repo needs a paid plan; mention it if the repo is private.

## 6. CI/CD with GitHub Actions
Create `.github/workflows/ci.yml` (minimal permissions, pinned major versions of official `actions/*` only, no third-party actions, no secrets):
- Trigger: `push` and `pull_request` on `<branch>`, plus `workflow_dispatch`.
- Job `check`: checkout; extract the `<script>` body and run `node --check`; grep guards that fail the build on `localStorage|sessionStorage|indexedDB|document.cookie|!important|alert\(|confirm\(|eval\(` and on any `http(s)://` resource loaded by `<script src>`, `<link href>`, `<img src>` or CSS `url()`; confirm `index.html` exists.
- Job `deploy` (only on pushes to `<branch>`, needs `check`): `actions/configure-pages`, `actions/upload-pages-artifact` (path `.`, publish only `index.html`, so stage it in a `_site/` folder first), `actions/deploy-pages`; permissions `pages: write`, `id-token: write`, `contents: read`; `environment: github-pages`; `concurrency` group `pages`.
- If you use this workflow, Pages source must be "GitHub Actions". Tell the user to switch it in Settings → Pages if it is currently "Deploy from a branch", otherwise the deploy job fails.
- Do not claim CI passes unless you saw a run succeed. If you cannot see Actions from here, say so and tell the user to check the Actions tab.

## 7. Final security re-scan and report
- Re-run the scan from step 1 on the final tree, including the new workflow and README. The workflow must not echo secrets or send repo contents anywhere.
- Push the remaining commits.
- Final report (short): repo URL, Pages URL, what was automated vs what the user must do by hand (Pages setting, About values if API blocked, FormSubmit activation), the scan result table, and anything not verified.
