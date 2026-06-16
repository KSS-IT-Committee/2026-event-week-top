docker exec postgres psql -U postgres -d appdata -t -A -c "SELECT '@' || username || 'KSS18' FROM users WHERE NOT has_logged_in ORDER BY username;"
