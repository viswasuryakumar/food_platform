# Campus Food Platform

## Quick Start

1. Start MongoDB (local `mongod`, no Docker):

```bash
npm run db:start
```

If `mongod` is missing, install MongoDB server first:

```bash
brew tap mongodb/brew
brew install mongodb-community
```

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

This runs setup and starts all services.

## Mock Data

Create demo users/restaurants/orders/payments:

```bash
npm run seed
```

Reset restaurant/order/payment data and reseed:

```bash
npm run seed:reset
```

Demo login credentials:

- `demo.user@campusfood.dev` / `demo12345`
- `admin@campusfood.dev` / `demo12345`

## Current Commands

- `npm run setup`: Install all dependencies + create missing `.env` files.
- `npm run db:start`: Start local MongoDB using `mongod`.
- `npm run dev`: Run all services and frontend in parallel (dev mode).
- `npm run setup:run`: Run setup and then start all services.
- `npm run seed`: Add/update demo data.
- `npm run seed:reset`: Clear restaurant/order/payment data and reseed.
