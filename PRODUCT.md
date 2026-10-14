# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

CleverTap engineering and product teams: engineers, PMs and designers.

- **Facilitator (host):** creates the session, designs the hat flow, runs the clock, reveals, records the decision. Usually also a participant.
- **Participants:** join by link or 6-character code and a name. No accounts, no install. Some do not have claude.ai accounts, which is why this is a standalone app.
- **Scribe (optional role):** one participant the host assigns to capture the spoken discussion for everyone.

## Product Purpose

Run Edward de Bono's Six Thinking Hats sessions live with a team: everyone looks at one question through one hat at a time, then the session ends in ranked points, a recorded decision and owned action items.

Success: a team goes from a focus question to a written decision in one sitting without the tool getting in the way, and the result can be pasted straight into Confluence, Jira or Slack.

## Positioning

Not a whiteboard with hat stickers. The tool enforces the method: one hat at a time on a shared clock, private writing revealed to everyone at 0:00 (no anchoring, no loudest-voice effect), or a scribe capturing an out-loud discussion. Every session ends as a decision record, not a pile of notes.

## Operating Context

- Sessions are **hybrid**: some people in a room, some remote, in the same session. Each person uses their own laptop or phone; the board is also likely to be screen-shared or shown on a room display during discussion.
- Lifecycle: create (team passcode) → share code/link → lobby → steps (write → reveal) → dot-vote → decision and action items → closed summary → archive.
- Two writing modes, chosen at creation: **Everyone writes** (private until the step is revealed) or **Scribe** (one person writes, notes visible live, each note credited to who said it or to "Team").
- The facilitator designs the flow: an ordered list of hats, each with its own timer and optional prompt. Built-in presets and saved team templates.
- Output: a Markdown summary (copy or download) and a passcode-gated archive of past sessions.

## Capabilities and Constraints

- Vue 3 + Vite SPA served by a Node 24 server; live state over Socket.IO; each viewer receives only what they may see.
- The six hats and their meanings are fixed product vocabulary (`shared/src/hats.ts`): White (facts & information), Red (feelings & intuition), Black (caution & risks), Yellow (benefits & value), Green (creativity & alternatives), Blue (process & control), each with a default prompt and timer.
- Limits: 1–20 steps; steps 0:30–30:00; 1–10 votes per person; up to 50 participants; points ≤500 characters; up to 30 points per person per step (200 notes per step in scribe mode).
- Facilitator controls: start, pause/resume, +1 min, reveal now, skip step, next step, edit upcoming steps, delete any point, assign/reassign scribe, close voting / skip voting, close session.
- No accounts: a team passcode gates creating sessions, the archive and templates; per-session tokens live in the browser; the admin link carries its key in the URL fragment.
- Must work at phone width (375 px) and in light and dark themes.
- Undecided: production hosting (Fly.io config exists; nothing deployed).

## Brand Commitments

- Name: **Six Hats**.
- Own identity: an internal team tool, not CleverTap-branded.
- Each hat is always identified by its name (and icon), never by colour alone.

## Evidence on Hand

- Design spec and implementation plan: `docs/superpowers/specs/2026-10-14-six-hats-session-tool-design.md`, `docs/superpowers/plans/2026-10-14-six-hats-session-tool.md`.
- No users, testimonials, usage data or screenshots of real sessions exist yet. Do not fabricate any.

## Product Principles

1. **One hat at a time.** Everything on screen serves the current hat; the rest of the flow stays in the background.
2. **Fair before fast.** Blind writing and a shared reveal protect quieter voices; once revealed, every point carries its author.
3. **The host steers, never blocks.** Facilitator controls are always at hand but never crowd what participants are thinking about.
4. **End with a record.** A session is finished when a decision and owned actions exist, not when the timer runs out.
5. **A link and a name.** Joining takes seconds, on any device, with no account.

## Accessibility & Inclusion

- Hats are never conveyed by colour alone.
- WCAG AA contrast in light and dark themes.
- Fully usable at 375 px wide and by keyboard.
- Readable at a distance when the board is screen-shared or shown on a room display.
