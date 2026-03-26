#!/bin/bash
# ============================================================
#  Seed — runs after 01-schema.sql on first container start
#
#  All sensitive values are read from environment variables.
#  Set them in your .env file — never hardcode them here.
#
#  Required env vars:
#    ADMIN_PASSWORD_HASH  — bcrypt hash of your admin password
#                           Generate: docker run --rm node:20-alpine \
#                             sh -c "npm i -q bcryptjs && node -e \
#                             \"require('bcryptjs').hash('YourPwd',12).then(console.log)\""
#
#  Optional env vars (fall back to placeholder values for local dev):
#    ADMIN_PROFILE_NAME      — your full name
#    ADMIN_PROFILE_HEADLINE  — your job title
#    ADMIN_PROFILE_BIO       — your short bio
#    ADMIN_PROFILE_EMAIL     — your contact email
#    ADMIN_PROFILE_GITHUB    — your GitHub URL
#    ADMIN_PROFILE_LINKEDIN  — your LinkedIn URL
# ============================================================
set -e

# Fail loudly if the one truly required var is missing
if [ -z "$ADMIN_PASSWORD_HASH" ]; then
  echo "ERROR: ADMIN_PASSWORD_HASH env var is not set."
  echo "Generate a bcrypt hash and add it to your .env file."
  echo "  docker run --rm node:20-alpine sh -c \\"
  echo "    \"npm i -q bcryptjs && node -e \\\"require('bcryptjs').hash('YourPassword',12).then(console.log)\\\"\""
  exit 1
fi

# Profile defaults for local dev — override via env in production
PROFILE_NAME="${ADMIN_PROFILE_NAME:-John Itopa ISAH}"
PROFILE_HEADLINE="${ADMIN_PROFILE_HEADLINE:-DevOps & Cloud Engineer}"
PROFILE_BIO="${ADMIN_PROFILE_BIO:-Engineering graduate specialising in cloud infrastructure, Kubernetes, and scalable distributed systems.}"
PROFILE_EMAIL="${ADMIN_PROFILE_EMAIL:-admin@example.com}"
PROFILE_GITHUB="${ADMIN_PROFILE_GITHUB:-https://github.com/johnitopaisah}"
PROFILE_LINKEDIN="${ADMIN_PROFILE_LINKEDIN:-https://linkedin.com/in/johnitopaisah}"

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname   "$POSTGRES_DB" \
  <<-EOSQL

  -- Admin user — password hash injected from ADMIN_PASSWORD_HASH env var
  INSERT INTO admin_user (username, password_hash)
  VALUES ('portfolioAdminUser', '$ADMIN_PASSWORD_HASH')
  ON CONFLICT (username) DO NOTHING;

  -- Placeholder profile — edit everything via admin-ui after first login
  INSERT INTO profile (name, headline, bio, email, github_url, linkedin_url)
  VALUES (
    '$PROFILE_NAME',
    '$PROFILE_HEADLINE',
    '$PROFILE_BIO',
    '$PROFILE_EMAIL',
    '$PROFILE_GITHUB',
    '$PROFILE_LINKEDIN'
  )
  ON CONFLICT DO NOTHING;

EOSQL

echo "✅  Seed complete — admin user and profile created"
