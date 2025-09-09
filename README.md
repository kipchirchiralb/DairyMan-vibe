# Dairyman

A Node.js + Express + EJS web app for managing dairy farm operations: farmer accounts, animals, milk production, expenses, and health records. Uses MySQL for persistence and Chart.js for simple dashboard charts.

## Stack

- Node.js, Express, EJS
- MySQL (mysql driver)
- express-session for auth sessions
- bcrypt for password hashing
- Chart.js on the dashboard

## Features

- Farmer registration and login with hashed passwords
- Session-based authentication and protected routes
- Farmer dashboard with per-animal milk-production trend charts (last 15 entries)
- MySQL schema covering farmers, animals, milk production, sales, medication, vaccination, expenses, losses, feed consumption

## Project Structure

```
.
├── server.js              # Express app, routes, session, MySQL connection
├── sqlStatement.js        # SQL helpers (e.g., production records per farmer)
├── utils.js               # Data grouping and extraction for charts
├── db.sql                 # Database schema and seed data
├── views/                 # EJS templates (index, login, register, dashboard)
├── public/                # Static assets (css, js, images)
├── package.json
└── README.md
```

## Prerequisites

- Node.js 18+
- MySQL 8.x (or compatible)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

MySQL connection defaults (see `server.js`):

- host: `localhost`
- database: `dairyman`
- user: `root`
- password: `password`
- port: `3307`

Adjust these in `server.js` to match your local MySQL setup.

## Database Setup

1. Start MySQL locally
2. Run the schema and seed script:
   ```bash
   mysql -u <USER> -p -h localhost -P <PORT> < db.sql
   ```
   Replace `<USER>` and `<PORT>` with your credentials (e.g., `root` and `3306` or `3307`). The script creates the `dairyman` database, tables, and inserts sample data.

## Running the App

- Development (auto-reload):
  ```bash
  npm run dev
  ```
- The server starts on `http://localhost:3000`

## Usage

- Visit `http://localhost:3000/` for the landing page
- Register at `/register`, then log in at `/login`
- After login, you are redirected to `/dashboard`

### Authenticated/Protected Routes

- `/dashboard` (requires session)
- `/expenses` (placeholder link in UI; currently protected by middleware)

## Routes Overview

- GET `/` → Renders `views/index.ejs`
- GET `/register` → Renders registration form
- POST `/register` → Creates farmer (with bcrypt-hashed password), then redirects to `/login`
- GET `/login` → Renders login form; supports `?message` for feedback
- POST `/login` → Authenticates and creates session; redirects to `/dashboard`
- GET `/dashboard` → Loads milk production stats for the logged-in farmer and renders charts
- GET `/logout` → Destroys session and redirects to `/login`

## Data and Queries

- `sqlStatement.js` exports `getProductionRecordsForFarmer(farmer_id)` which aggregates daily milk production per animal for the farmer.
- `utils.js` groups records by animal tag and extracts the latest 15 date/production pairs for Chart.js.

## Views and Static Assets

- EJS templates located in `views/`
  - `index.ejs`, `_header.ejs`, `_footer.ejs`, `login.ejs`, `register.ejs`, `dashboard.ejs`
- Frontend assets in `public/` (CSS/JS/images)
  - `public/dashboard.css`, `public/main.css`, `public/login.css`, `public/register.css`, `public/main.js`

## Security Notes

- Update the session `secret` in `server.js`
- Replace development MySQL credentials with environment variables for production
- The current SQL statements interpolate user input directly; use parameterized queries to prevent SQL injection if extending

## Known Limitations / TODOs

- SQL injection risk on `POST /register` and `POST /login` (string interpolation). Use placeholders/prepared statements
- Hardcoded DB credentials in `server.js`
- `public/main.js` contains a trailing `ww` that should be removed
- No CSRF protection
- No password reset flow; the link in `login.ejs` is a placeholder
- No error pages; errors are returned as plain responses
- Some sidebar links in `dashboard.ejs` are placeholders (no routes implemented yet)

## Troubleshooting

- Cannot connect to MySQL
  - Verify host/port/user/password in `server.js`
  - Ensure MySQL is running and the `dairyman` database exists
- Session not persisting
  - Ensure cookies are enabled in the browser
  - Check that `express-session` is initialized before routes
- Charts not rendering
  - Verify data exists for the logged-in farmer (see `db.sql` seeds)
  - Open DevTools Console for errors
- Port already in use
  - Change the port in `server.js` or stop the conflicting process

## Scripts

- `npm run dev` → start server with Node’s `--watch`

## License

MIT (or your preferred license)
