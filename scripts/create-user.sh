# Create one account in the shared `appdata` DB. Run on the VPS (Postgres has
# no host port, so it goes through the `postgres` container): copy-paste the
# line below with USERNAME and PASSWORD replaced. pgcrypto's bf/12 salt makes
# a $2a$ bcrypt hash — the same shape 2026-account-generator ships and what
# /login (bcryptjs) verifies. Create-only: it errors if the username already
# exists instead of silently resetting a real account's password. Neither
# value may contain a single quote (').
docker exec postgres psql -U postgres -d appdata -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; INSERT INTO users (username, password_hash) VALUES ('USERNAME', crypt('PASSWORD', gen_salt('bf', 12)));"
