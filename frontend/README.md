# Last-Minute Study frontend

The Next.js App Router client for the local-first revision workspace. It includes the focus timer, priority-based daily plan, subject/topic planner, study streak, exam countdown, and private per-subject notes.

For product scope, privacy notes, and deployment setup, see the [repository README](../README.md).

## Run locally

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
```

`next build` creates the static site in `out/`. Browser state is stored locally; no API URL or secret is required.

GitHub Actions runs lint, type checks, dependency audit, and the static build for pushes and pull requests.
