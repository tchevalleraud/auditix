.DEFAULT_GOAL := help

# --- Internals ---
DB_USER  ?= $(shell grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2)
DB_USER  := $(if $(DB_USER),$(DB_USER),auditix)
DB_NAME  ?= $(shell grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2)
DB_NAME  := $(if $(DB_NAME),$(DB_NAME),auditix)
HTTP_PORT ?= $(shell grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2)
HTTP_PORT := $(if $(HTTP_PORT),$(HTTP_PORT),80)

help: ## Display this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ----- Lifecycle -----

up: ## Start all services (build and install automatically if needed)
	@cp -n .env.example .env 2>/dev/null || true
	docker compose up -d --build

down: ## Stop all services
	docker compose down

restart: ## Restart all services
	docker compose restart

logs: ## Show logs for all services
	docker compose logs -f

# ----- Status -----

status: ## Show application status as a synthetic table
	@CIDS=$$(docker compose ps -q 2>/dev/null); \
	if [ -z "$$CIDS" ]; then echo "\033[31mno running containers\033[0m"; exit 0; fi; \
	{ \
		docker compose ps --format 'PS|{{.Service}}|{{.Name}}|{{.State}}|{{.Status}}'; \
		docker stats --no-stream --format 'ST|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' $$CIDS; \
	} | awk -F'|' ' \
		$$1=="PS" { \
			name=$$3; svc[name]=$$2; state[name]=$$4; s=$$5; \
			h="-"; \
			if (s ~ /\(healthy\)/)        h="healthy"; \
			else if (s ~ /\(unhealthy\)/) h="unhealthy"; \
			else if (s ~ /\(starting\)/)  h="starting"; \
			sub(/^Up /, "", s); sub(/ \([^)]+\)$$/, "", s); \
			health[name]=h; uptime[name]=s; order[++n]=name; total++; \
			if (state[name]=="running") up++; \
			if ($$2 ~ /^worker-/) workers++; \
		} \
		$$1=="ST" { cpu[$$2]=$$3; mem[$$2]=$$4; mp[$$2]=$$5 } \
		END { \
			fmt="%-22s %-9s %-10s %-16s %-8s %-20s %-7s\n"; \
			printf "\033[36m" fmt "\033[0m", "SERVICE","STATE","HEALTH","UPTIME","CPU%","MEM","MEM%"; \
			for (i=1;i<=n;i++) { name=order[i]; \
				printf fmt, svc[name], state[name], health[name], uptime[name], \
					cpu[name]?cpu[name]:"-", mem[name]?mem[name]:"-", mp[name]?mp[name]:"-"; \
			} \
			printf "\n\033[1mSummary:\033[0m %d/%d services up · %d workers", up, total, workers; \
		}'; \
	echo ""; \
	CODE=$$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:$(HTTP_PORT) 2>/dev/null || echo "000"); \
	case "$$CODE" in 2*|301|302|307|308) MSG="\033[32m$$CODE OK\033[0m";; *) MSG="\033[31m$$CODE down\033[0m";; esac; \
	printf "\033[1mHTTP:\033[0m    http://localhost:%s → %b\n" "$(HTTP_PORT)" "$$MSG"

# ----- Backup / restore -----

backup: ## Create a timestamped backup of the database and persistent files (LABEL=name to tag the archive)
	@TS=$$(date +%Y%m%d-%H%M%S); \
	LABEL_PART=""; \
	[ -n "$(LABEL)" ] && LABEL_PART="-$(LABEL)"; \
	OUT_DIR="backups/auditix$$LABEL_PART-$$TS"; \
	OUT_TGZ="backups/auditix$$LABEL_PART-$$TS.tar.gz"; \
	mkdir -p "$$OUT_DIR"; \
	echo "\033[36m[backup]\033[0m Ensuring postgres is running..."; \
	docker compose up -d postgres >/dev/null 2>&1; \
	for i in 1 2 3 4 5 6 7 8 9 10; do \
		docker compose exec -T postgres pg_isready -U $(DB_USER) >/dev/null 2>&1 && break; \
		sleep 1; \
	done; \
	echo "\033[36m[backup]\033[0m Dumping database '$(DB_NAME)'..."; \
	docker compose exec -T postgres pg_dump -U $(DB_USER) -d $(DB_NAME) | gzip > "$$OUT_DIR/db.sql.gz"; \
	echo "\033[36m[backup]\033[0m Archiving uploads, reports and collections..."; \
	tar czf "$$OUT_DIR/files.tar.gz" \
		$$([ -d data/collections ] && echo data/collections) \
		$$([ -d app/var/uploads ] && echo app/var/uploads) \
		$$([ -d app/var/reports ] && echo app/var/reports) \
		2>/dev/null || true; \
	cat VERSION > "$$OUT_DIR/VERSION"; \
	git rev-parse --abbrev-ref HEAD 2>/dev/null > "$$OUT_DIR/REF" || true; \
	git rev-parse HEAD 2>/dev/null >> "$$OUT_DIR/REF" || true; \
	tar czf "$$OUT_TGZ" -C backups "auditix$$LABEL_PART-$$TS"; \
	rm -rf "$$OUT_DIR"; \
	echo "\033[32m[backup]\033[0m Saved to $$OUT_TGZ"

restore: ## Restore from a backup archive (BACKUP=path/to/auditix-YYYYMMDD-HHMMSS.tar.gz)
	@if [ -z "$(BACKUP)" ]; then echo "Usage: make restore BACKUP=path/to/auditix-*.tar.gz"; exit 1; fi
	@if [ ! -f "$(BACKUP)" ]; then echo "Backup not found: $(BACKUP)"; exit 1; fi
	@printf "\033[33mThis will overwrite the current database and uploaded files.\033[0m\n"
	@printf "Type 'yes' to continue: "
	@read CONFIRM; if [ "$$CONFIRM" != "yes" ]; then echo "Aborted."; exit 1; fi
	@TMP=$$(mktemp -d); \
	tar xzf "$(BACKUP)" -C "$$TMP"; \
	BDIR=$$(find "$$TMP" -maxdepth 1 -type d -name 'auditix-*' | head -1); \
	if [ -z "$$BDIR" ]; then echo "Invalid archive layout"; rm -rf "$$TMP"; exit 1; fi; \
	echo "\033[36m[restore]\033[0m Stopping app services..."; \
	docker compose stop php node nginx $$(docker compose config --services | grep '^worker-') >/dev/null 2>&1 || true; \
	echo "\033[36m[restore]\033[0m Starting postgres..."; \
	docker compose up -d postgres >/dev/null; \
	for i in 1 2 3 4 5 6 7 8 9 10; do \
		docker compose exec -T postgres pg_isready -U $(DB_USER) >/dev/null 2>&1 && break; \
		sleep 1; \
	done; \
	echo "\033[36m[restore]\033[0m Restoring database..."; \
	docker compose exec -T postgres psql -U $(DB_USER) -d postgres -c "DROP DATABASE IF EXISTS $(DB_NAME); CREATE DATABASE $(DB_NAME) OWNER $(DB_USER);" >/dev/null; \
	gunzip -c "$$BDIR/db.sql.gz" | docker compose exec -T postgres psql -U $(DB_USER) -d $(DB_NAME) >/dev/null; \
	if [ -f "$$BDIR/files.tar.gz" ]; then \
		echo "\033[36m[restore]\033[0m Restoring files..."; \
		tar xzf "$$BDIR/files.tar.gz" -C .; \
	fi; \
	rm -rf "$$TMP"; \
	echo "\033[36m[restore]\033[0m Restarting all services..."; \
	docker compose up -d; \
	echo "\033[32m[restore]\033[0m Done."

# ----- Diagnostics -----

doctor: ## Diagnose common issues (containers, postgres, schema, migrations)
	@./scripts/doctor.sh

doctor-fix: ## Run doctor and apply auto-fixes for safe issues
	@./scripts/doctor.sh --fix

# ----- Upgrade -----

upgrade: ## Upgrade in place (BRANCH=name or TAG=vX.Y.Z to switch refs, SKIP_BACKUP=1 to skip backup)
	@CURRENT_REF="$$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"; \
	if [ -n "$(BRANCH)" ] && [ -n "$(TAG)" ]; then \
		echo "\033[31mError:\033[0m use either BRANCH= or TAG=, not both"; exit 1; \
	fi; \
	if [ -n "$(BRANCH)" ]; then \
		TARGET_REF="$(BRANCH)"; TARGET_KIND=branch; \
	elif [ -n "$(TAG)" ]; then \
		TARGET_REF="$(TAG)"; TARGET_KIND=tag; \
	elif [ "$$CURRENT_REF" = "HEAD" ]; then \
		echo "\033[36m[upgrade]\033[0m Detached HEAD detected, resolving latest stable tag..."; \
		LATEST_TAG="$$(git ls-remote --tags --refs origin 2>/dev/null \
			| awk -F/ '{print $$NF}' \
			| grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$$' \
			| sort -V \
			| tail -n 1)"; \
		if [ -z "$$LATEST_TAG" ]; then \
			echo "\033[31mError:\033[0m cannot resolve latest tag. Specify BRANCH= or TAG= explicitly."; exit 1; \
		fi; \
		TARGET_REF="$$LATEST_TAG"; TARGET_KIND=tag; \
		CURRENT_TAG="$$(git describe --tags --exact-match 2>/dev/null || echo HEAD)"; \
		echo "\033[36m[upgrade]\033[0m $$CURRENT_TAG → $$LATEST_TAG (latest tag)"; \
	else \
		TARGET_REF="$$CURRENT_REF"; TARGET_KIND=branch; \
	fi; \
	if [ "$$TARGET_REF" != "$$CURRENT_REF" ]; then \
		BACKUP_LABEL="from-$$CURRENT_REF"; \
		[ "$$CURRENT_REF" = "HEAD" ] && BACKUP_LABEL="from-$$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)"; \
	else \
		BACKUP_LABEL=""; \
	fi; \
	echo "\033[36m[1/7]\033[0m Preparing upgrade ($$CURRENT_REF → $$TARGET_REF, kind=$$TARGET_KIND)..."; \
	if [ "$(SKIP_BACKUP)" = "1" ]; then \
		echo "\033[33m[2/7]\033[0m Backup skipped (SKIP_BACKUP=1)"; \
	else \
		echo "\033[36m[2/7]\033[0m Creating safety backup..."; \
		$(MAKE) --no-print-directory backup LABEL="$$BACKUP_LABEL"; \
	fi; \
	echo "\033[36m[3/7]\033[0m Fetching from origin..."; \
	git stash --quiet 2>/dev/null || true; \
	git fetch --tags --prune origin; \
	if [ "$$TARGET_KIND" = "tag" ]; then \
		git checkout "$$TARGET_REF"; \
	else \
		git checkout "$$TARGET_REF"; \
		git pull --ff-only origin "$$TARGET_REF"; \
	fi; \
	$(MAKE) --no-print-directory _upgrade_apply

_upgrade_apply:
	@echo "\033[36m[4/7]\033[0m Rebuilding containers..."
	@if ! docker compose up -d --build --remove-orphans 2>/tmp/auditix_upgrade_up.err; then \
		cat /tmp/auditix_upgrade_up.err; \
		if grep -q 'is already in use by container' /tmp/auditix_upgrade_up.err; then \
			echo "\033[33m[4/7]\033[0m Stale container name conflict, removing leftover container(s) and retrying..."; \
			for c in $$(grep -o '"/[A-Za-z0-9_.-]*"' /tmp/auditix_upgrade_up.err | tr -d '"/'); do \
				echo "  - removing $$c"; docker rm -f "$$c" >/dev/null 2>&1 || true; \
			done; \
			docker compose up -d --build --force-recreate --remove-orphans; \
		else \
			rm -f /tmp/auditix_upgrade_up.err; exit 1; \
		fi; \
	fi; \
	rm -f /tmp/auditix_upgrade_up.err
	@echo "\033[36m[5/7]\033[0m Installing PHP dependencies and applying migrations..."
	docker compose exec -T php composer install --no-interaction --optimize-autoloader
	docker compose exec -T php php bin/console cache:clear --no-interaction
	docker compose exec -T php php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration
	@echo "\033[36m[6/7]\033[0m Restarting workers..."
	docker compose restart php node $$(docker compose config --services | grep '^worker-') >/dev/null
	@echo "\033[36m[7/7]\033[0m Waiting for frontend and reloading nginx..."
	@docker compose exec -T node sh -c 'while ! wget -q --spider http://localhost:3000 2>/dev/null; do sleep 3; done'
	docker compose restart nginx
	@echo "\033[32mUpgrade complete!\033[0m Run 'make doctor' to verify."
