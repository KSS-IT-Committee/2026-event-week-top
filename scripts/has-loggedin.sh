docker exec postgres psql -U postgres -d appdata -c "SELECT username FROM users WHERE has_logged_in ORDER BY username;"
