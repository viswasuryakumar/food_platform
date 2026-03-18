# Campus Food Platform

## Quick Start

1. Start MongoDB (Docker):

```bash
npm run db:start
```

If this says Docker daemon is not running, start Docker Desktop first and rerun.

2. Install dependencies and generate missing `.env` files:

```bash
npm run setup
```

3. Start all services and frontend:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173` and API Gateway on `http://localhost:3000`.

## One Command (Setup + Run)

```bash
npm run setup:run
```

This runs setup, starts MongoDB, and starts all services.

## Useful Scripts

- `npm run setup`: Install all dependencies + create missing `.env` files.
- `npm run setup:env`: Create only `.env` files (skip dependency install).
- `npm run db:start`: Start local MongoDB in Docker container `campus-food-mongo`.
- `npm run db:stop`: Stop the MongoDB Docker container.
- `npm run db:status`: Check MongoDB container status.
- `npm run dev`: Run all services and frontend in parallel (dev mode).
- `npm run dev:with-db`: Start MongoDB then run all services.
