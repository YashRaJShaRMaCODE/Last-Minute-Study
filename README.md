# Last-Minute Study

**One page. One next step. That’s enough.** A calm, local-first revision workspace that turns a large exam list into small sessions you can finish.

**Live app:** <https://last-minute-study-board.onrender.com/>

## Study tools

- Set an exam date and see a live day countdown.
- Add up to 12 subjects, search by subject or topic, and build each list from small revision sessions.
- Check off topics and see progress update immediately.
- See the estimated minutes left for each subject and across the whole plan.
- Set a realistic daily study target from unfinished minutes and your exam date; it recalculates as you finish topics and rolls over at local midnight.
- Use the 25-minute focus timer, pause it, resume it, or reset it. Its clock stays accurate when a browser tab is in the background.
- Keep a short note for each subject.
- Continue where you left off: subjects, progress, exam date, focus count, and notes are saved in this browser.
- Download a versioned JSON backup or restore it on another browser; the file stays on your device until you choose where to save it.
- Clear all local study data when you need a fresh start; this also stops and resets an active focus timer.

The preview starts with sample subjects. Replace them with your own plan. There is no account, cloud sync, payment, or backend connection in the live app; browser data remains on the current device. If browser storage is blocked or full, edits stay in memory until the page is reloaded or closed.

## Run locally

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Verify and build

```powershell
npm run lint
npm run typecheck
npm run build
```

GitHub Actions runs lint, type checks, dependency audit, and the static build for pushes and pull requests.

Next.js static export writes the deployable site to `frontend/out`. Render publishes that directory from this repository. The deployment and response headers are described in [`render.yaml`](render.yaml).

## Repository map

- `frontend/` — Next.js revision workspace and local-first browser experience.
- `backend/` — Django project scaffolding; its apps do not currently expose a study API and are not used by the live page.

## Privacy

Study data is saved under `last-minute-study.v1` in browser local storage. It is not sent to a server. Do not use a shared device for private notes. **Clear this browser’s study data** removes the locally saved plan.
