# Six Hats

Run Six Thinking Hats sessions with your team. The facilitator designs the flow (which hats, in what order, how long each), everyone writes privately under each hat, and at 0:00 the points are revealed to all. Then the team dot-votes, records a decision and action items, and exports a Markdown summary.

## Requirements

- Node 24 (`nvm use` reads `.nvmrc`)
- Docker, for the container build

## Develop

```bash
npm install
npm run dev
```

The dev API runs on port 8787 and Vite serves the UI at http://localhost:5173. Vite picks the next free port if 5173 is busy, so open the URL Vite prints. The team passcode in development is `dev`; data lives in `./data`.

## Test

```bash
npm test
npm run typecheck
```

## Build and run locally

```bash
npm run build
TEAM_PASSCODE=change-me npm start
```

Open http://localhost:8080. If 8080 is taken, set `PORT`, for example `PORT=8090 TEAM_PASSCODE=change-me npm start`.

## Run with Docker

```bash
docker build -t six-hats .
docker run --rm -p 8080:8080 -e TEAM_PASSCODE=change-me -v six-hats-data:/data six-hats
```

The container is exposed directly here, so leave `TRUST_PROXY` unset. Behind a reverse proxy, set `TRUST_PROXY` to the number of proxies in front of it (see Configuration); otherwise the passcode limiter sees only the proxy's address.

## Deploy to Fly.io

```bash
fly launch --no-deploy --copy-config
fly volumes create six_hats_data --size 1 --region bom
fly secrets set TEAM_PASSCODE='a-long-team-passcode'
fly deploy
```

Keep exactly one machine: sessions live in that machine's memory and SQLite file.

## Deploy to Render (free)

Open https://render.com/deploy?repo=https://github.com/shivams07/six-hats, enter a `TEAM_PASSCODE`, and apply. `render.yaml` sets up one free Docker web service.

The free plan has no persistent disk: the archive and saved templates are wiped whenever the service redeploys, restarts or sleeps (after 15 minutes with no traffic). Live sessions keep it awake while people are connected. Export each summary before you close a session.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TEAM_PASSCODE` | required | Needed to create sessions, open the archive and manage templates |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `./data` (`/data` in the image) | SQLite location |
| `WEB_DIR` | unset (`/app/dist/web` in the image) | Built UI to serve; unset in development, where Vite serves it |
| `TRUST_PROXY` | unset (no proxy trusted) | Number of trusted reverse proxies; set `1` on Fly or Render, leave unset when exposed directly |

## Running a session

1. **Create** (`/new`, team passcode): title, focus question, your name, votes per person, and the flow. Start from a preset or a saved team template.
2. **Share** the 6-character code or invite link. Keep the admin link for yourself.
3. **Lobby**: people join with their name. Press **Start**.
4. **Each step**: everyone writes privately until 0:00, then all points appear with names. Pause, add a minute, reveal early, skip, or edit upcoming steps from the console.
5. **Vote**, then record the **decision** and **action items**, then **close** to get the summary.

Lost the admin link? Open the archive with the team passcode and choose **Open as facilitator**.
