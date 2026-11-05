# Last-Minute Study

A study and revision application with a Django backend and a Next.js frontend.

## Repository layout

- `backend/` — Django project for accounts, subjects, categories, notes, and payment-related flows
- `frontend/` — Next.js web interface

## Run locally

Start the backend:

```sh
cd backend
python manage.py migrate
python manage.py runserver
```

In a second terminal, start the frontend:

```sh
cd frontend
npm ci
npm run dev
```

The frontend uses the scripts in `frontend/package.json`. Configure any backend environment values in your local environment; do not commit secrets.
