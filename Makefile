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

upgrade: ## Pull latest version, rebuild and apply migrations
	@echo "\033[36m[1/5]\033[0m Pulling latest changes..."
	git stash --quiet 2>/dev/null || true
	git pull --ff-only
	@echo "\033[36m[2/5]\033[0m Rebuilding containers..."
	docker compose up -d --build
	@echo "\033[36m[3/5]\033[0m Clearing cache..."
	docker compose exec php php bin/console cache:clear --no-interaction
	@echo "\033[36m[4/5]\033[0m Applying database migrations..."
	docker compose exec php php bin/console doctrine:migrations:migrate --no-interaction
	@echo "\033[36m[5/6]\033[0m Restarting services..."
	docker compose restart php node worker-scheduler worker-monitoring worker-collector worker-generator worker-cleanup worker-compliance
	@echo "\033[36m[6/6]\033[0m Waiting for frontend and reloading nginx..."
	@docker compose exec -T node sh -c 'while ! wget -q --spider http://localhost:3000 2>/dev/null; do sleep 3; done'
	docker compose restart nginx
	@echo "\033[32mUpgrade complete!\033[0m"
