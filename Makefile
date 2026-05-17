# ============================================================
#  Portfolio MCS — Makefile shortcuts
#  Usage: make <target>
# ============================================================

.PHONY: help setup up down restart logs \
        up-db up-api up-user up-admin \
        build rebuild clean \
        seed hash-password \
        status

# ── Default ──────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Portfolio MCS — available commands"
	@echo ""
	@echo "  make setup          		Copy .env.example → .env (first-time setup)"
	@echo "  make up             		Build & start all 4 services"
	@echo "  make down          		Stop all services"
	@echo "  make restart        		Stop then start all services"
	@echo "  make rebuild        		Force rebuild all images then start"
	@echo "  make rebuild-api		 		Force rebuild only the API image then start"
	@echo "  make rebuild-user-api 	Force rebuild only the API and User UI images then start"
	@echo "  make rebuild-admin-api 	Force rebuild only the API and Admin UI images then start"
	@echo "  make rebuild-user	 		Force rebuild only the User UI image then start"
	@echo "  make rebuild-admin	 		Force rebuild only the Admin UI image then start"
	@echo "  make rebuild-db		 		Force rebuild only the DB image then start"
	@echo "  make seed           		Run database seed script (requires API to be running)"
	@echo "  make logs           		Tail logs from all services"
	@echo "  make status         		Show running container status"
	@echo ""
	@echo "  make up-db          		Start only the database"
	@echo "  make up-api         		Start db + api"
	@echo "  make up-user        		Start db + api + user-ui"
	@echo "  make up-admin       		Start db + api + admin-ui"
	@echo ""
	@echo "  make hash-password  Generate a bcrypt hash (prompts for password)"
	@echo "  make clean          Remove all containers, volumes, and images"
	@echo ""

# ── First-time setup ─────────────────────────────────────────
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅  .env created — open it and fill in JWT_SECRET before running 'make up'"; \
	else \
		echo "ℹ️   .env already exists — skipping"; \
	fi

# ── Core lifecycle ───────────────────────────────────────────
up:
	docker compose up --build -d
	@echo ""
	@echo "  🚀  Services starting up:"
	@echo "  user-ui   → http://localhost:3000"
	@echo "  admin-ui  → http://localhost:3001"
	@echo "  api       → http://localhost:4000"
	@echo "  db        → localhost:5432" @echo ""
	@echo "  Run 'make logs' to watch startup logs"

down:
	docker compose down

restart: down up

rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d
	
rebuild-api:
	docker compose build --no-cache api

rebuild-user:
	docker compose build --no-cache user-ui

rebuild-admin:
	docker compose build --no-cache admin-ui

rebuild-db:
	docker compose build --no-cache db

rebuild-user-api:
	docker compose build --no-cache api user-ui

rebuild-admin-api:
	docker compose build --no-cache api admin-ui

logs:
	docker compose logs -f

status:
	docker compose ps

# ── Individual services ──────────────────────────────────────
up-db:
	docker compose up --build -d db

up-api:
	docker compose up --build -d db api

up-user:
	docker compose up --build -d db api user-ui

up-admin:
	docker compose up --build -d db api admin-ui

# ── Utilities ────────────────────────────────────────────────
hash-password:
	@read -p "Enter password to hash: " pw; \
	node -e "const b=require('bcryptjs');b.hash('$$pw',12).then(h=>{console.log('\n  Hash:\n  '+h+'\n');process.exit()}).catch(e=>{console.error(e);process.exit(1)})" 2>/dev/null \
	|| docker run --rm node:20-alpine node -e \
		"const b=require('bcryptjs');b.hash('$$pw',12).then(h=>{console.log('\n  Hash:\n  '+h+'\n')}).catch(console.error)" \
	|| echo "Install node locally or ensure Docker is running"

clean:
	@echo "⚠️  This removes ALL containers, volumes and images for this project."
	@read -p "  Are you sure? [y/N] " confirm; \
	if [ "$$confirm" = "y" ]; then \
		docker compose down -v --rmi all --remove-orphans; \
		echo "✅  Clean done"; \
	else \
		echo "  Aborted"; \
	fi
