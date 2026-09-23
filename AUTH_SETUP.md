# Final Login Integration

The simple login is now wired into the backend globally.

## Protected APIs

The existing business APIs remain unchanged and are protected by `requireSimpleAuth`:

- `/api/home`
- `/api/workers`
- `/api/weeks`
- `/api/transactions`
- `/api/archive`

Public only for authentication/health:

- `POST /api/auth/login`
- `POST /api/auth/verify`
- `POST /api/auth/logout`
- `GET /api/health`

## Create the login user

Add to `.env`:

```env
AUTH_USERNAME=admin
AUTH_PASSWORD=123456
```

Keep your existing `MONGODB_URI`.

Then run once:

```bash
npm install
npm run seed:auth
npm run dev
```

## Frontend pages

Copy these files into the frontend's JS/public area:

- `login.html`
- `login.js`
- `auth-guard.js`
- `authFetch.js`
- `protected-page.js`

Make `login.html` the unauthenticated entry page.

On every protected HTML page, load the guard as a module:

```html
<script type="module" src="./js/protected-page.js"></script>
```

Use `authFetch()` instead of raw `fetch()` for all business API requests. It automatically sends:

- `X-Username`
- `X-Login-Key`

and redirects to login when the backend returns `401`.

## Important

The password is intentionally stored in MongoDB as plain text because that was explicitly requested. The password is NOT stored in localStorage. Only the username and a random login key are stored there.

This is lightweight access protection, not production-grade authentication.
