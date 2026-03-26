FROM postgres:16-alpine

LABEL maintainer="John Itopa ISAH"
LABEL service="portfolio-db"

# Init scripts run in alphabetical order on first container start.
# 01-schema.sql  — creates all tables and indexes
# 02-seed.sh     — inserts admin user + profile from env vars (no hardcoded secrets)
COPY schema.sql /docker-entrypoint-initdb.d/01-schema.sql
COPY seed.sh    /docker-entrypoint-initdb.d/02-seed.sh

# Ensure the seed script is executable
RUN chmod +x /docker-entrypoint-initdb.d/02-seed.sh

EXPOSE 5432
