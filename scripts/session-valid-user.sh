docker exec postgres psql -U postgres -d appdata -c "SELECT DISTINCT username FROM sessions WHERE expires_at > now() ORDER BY 1;"
