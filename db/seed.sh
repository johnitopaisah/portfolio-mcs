#!/bin/bash
# ============================================================
#  Seed — runs after 01-schema.sql on first container start
#
#  All sensitive values are read from environment variables.
#  Set them in your .env file — never hardcode them here.
#
#  Uses psql -v variables + a QUOTED heredoc (<<-'EOSQL') so bash
#  never expands the $ signs inside bcrypt hashes.
# ============================================================
set -e

if [ -z "$ADMIN_PASSWORD_HASH" ]; then
  echo "ERROR: ADMIN_PASSWORD_HASH env var is not set."
  exit 1
fi

PROFILE_NAME="${ADMIN_PROFILE_NAME:-John Itopa ISAH}"
PROFILE_HEADLINE="${ADMIN_PROFILE_HEADLINE:-DevOps & Cloud Engineer}"
PROFILE_BIO="${ADMIN_PROFILE_BIO:-Engineering graduate specialising in cloud infrastructure, Kubernetes, and scalable distributed systems.}"
PROFILE_EMAIL="${ADMIN_PROFILE_EMAIL:-admin@example.com}"
PROFILE_GITHUB="${ADMIN_PROFILE_GITHUB:-https://github.com/johnitopaisah}"
PROFILE_LINKEDIN="${ADMIN_PROFILE_LINKEDIN:-https://linkedin.com/in/johnitopaisah}"

# Pass all values as psql variables so bash NEVER touches the $ signs in the hash.
# :'var' is psql's safely-quoted string interpolation syntax.
psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname   "$POSTGRES_DB" \
     -v hash="$ADMIN_PASSWORD_HASH" \
     -v pname="$PROFILE_NAME" \
     -v headline="$PROFILE_HEADLINE" \
     -v bio="$PROFILE_BIO" \
     -v email="$PROFILE_EMAIL" \
     -v github="$PROFILE_GITHUB" \
     -v linkedin="$PROFILE_LINKEDIN" \
<<-'EOSQL'

  INSERT INTO admin_user (username, password_hash)
  VALUES ('portfolioAdminUser', :'hash')
  ON CONFLICT (username) DO NOTHING;

  INSERT INTO profile (name, headline, bio, email, github_url, linkedin_url, hero_tags)
  VALUES (
    :'pname',
    :'headline',
    :'bio',
    :'email',
    :'github',
    :'linkedin',
    ARRAY['Kubernetes', 'AWS', 'CI/CD', 'Docker', 'Terraform', 'GitOps']
  )
  ON CONFLICT DO NOTHING;

EOSQL

echo "✅  Seed complete — admin user and profile created"
