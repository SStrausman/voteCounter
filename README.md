# Vote Counter

React frontend with Auth0 authentication, an Express API, and Supabase PostgreSQL storage through Drizzle ORM.

## Auth0

Create an Auth0 API with this identifier:

```text
https://api.votecounter.local
```

Use `RS256` as its signing algorithm. In the existing Single Page Application, allow `http://localhost:5173` as a callback URL, logout URL, and web origin.

The frontend requests an access token for this API. The Express server validates its audience, issuer, signature, and expiration before serving game routes.

## Supabase

Copy the PostgreSQL connection string from the Supabase project dashboard and place it directly in the local `.env` file:

```text
DATABASE_URL=postgresql://...
```

Do not commit this value or send it through chat. Then apply the generated schema migration:

```bash
npm run db:migrate
```

The schema contains users, games, game members, game options, and votes. Users are created locally from the stable Auth0 `sub` claim when they first call a protected endpoint. Display names, profile picture URLs, and light or dark theme preferences are stored on users, while games played is derived from game memberships.

## Development

Run the frontend and API in separate terminals:

```bash
npm run dev
```

```bash
npm run server:dev
```

The frontend runs at `http://localhost:5173` and the API runs at `http://localhost:3001`.

## Heroku

The production Express process serves both the `/api` routes and the built React app. Configure these Heroku Config Vars before deploying:

```text
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.votecounter.local
CLIENT_ORIGIN=https://your-app.herokuapp.com
DATABASE_URL=postgresql://...
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-auth0-client-id
VITE_AUTH0_AUDIENCE=https://api.votecounter.local
VITE_API_URL=/api
```

Do not set `PORT`; Heroku supplies it. Add the Heroku app URL to the Auth0 application's allowed callback URLs, logout URLs, and web origins.

## API

- `GET /api/health` is public.
- `GET /api/games` returns all games with their moderator and player list.
- `POST /api/games` creates a game with the authenticated user as moderator and accepts JSON shaped like `{ "name": "Game name" }`. New games start with no players.
- `GET /api/profile` returns the authenticated user's profile and games-played count.
- `PATCH /api/profile` updates the authenticated user's display name and profile picture URL.

Frontend components can call protected endpoints through `useApi` from `src/api/useApi.js`.
