.DEFAULT_GOAL := help

help: ## Display this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

up: ## Start all services (build and install automatically if needed)
	@cp -n .env.example .env 2>/dev/null || true
	docker compose up -d --build

down: ## Stop all services
	docker compose down

restart: ## Restart all services
	docker compose restart

logs: ## Show logs for all services
	docker compose logs -f

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
	PORT=$$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2); PORT=$${PORT:-80}; \
	CODE=$$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:$$PORT 2>/dev/null || echo "000"); \
	case "$$CODE" in 2*|301|302|307|308) MSG="\033[32m$$CODE OK\033[0m";; *) MSG="\033[31m$$CODE down\033[0m";; esac; \
	printf "\033[1mHTTP:\033[0m    http://localhost:%s → %b\n" "$$PORT" "$$MSG"

upgrade: ## Pull latest version, rebuild and apply migrations
	@echo "\033[36m[pull]\033[0m Pulling latest changes..."
	@git stash --quiet 2>/dev/null || true
	@git pull --ff-only
	@$(MAKE) --no-print-directory _upgrade

_upgrade:
	@echo "\033[36m[1/6]\033[0m Rebuilding containers..."
	docker compose up -d --build
	@echo "\033[36m[2/6]\033[0m Installing PHP dependencies..."
	docker compose exec -T php composer install --no-interaction --optimize-autoloader
	@echo "\033[36m[3/6]\033[0m Clearing cache..."
	docker compose exec php php bin/console cache:clear --no-interaction
	@echo "\033[36m[4/6]\033[0m Applying database migrations..."
	docker compose exec php php bin/console doctrine:migrations:migrate --no-interaction
	@echo "\033[36m[5/6]\033[0m Restarting services..."
	docker compose restart php node worker-scheduler worker-monitoring worker-collector worker-generator worker-cleanup worker-compliance
	@echo "\033[36m[6/6]\033[0m Waiting for frontend and reloading nginx..."
	@docker compose exec -T node sh -c 'while ! wget -q --spider http://localhost:3000 2>/dev/null; do sleep 3; done'
	docker compose restart nginx
	@echo "\033[32mUpgrade complete!\033[0m"
