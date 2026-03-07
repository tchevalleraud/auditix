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

build: ## Rebuild Docker images
	docker compose build

logs: ## Show logs for all services
	docker compose logs -f

logs-php: ## Show PHP logs
	docker compose logs -f php

logs-workers: ## Show all workers logs
	docker compose logs -f worker-scheduler worker-monitoring worker-collector worker-generator

console: ## Open a shell in the PHP container
	docker compose exec php bash

sf: ## Run a Symfony console command (usage: make sf CMD="cache:clear")
	docker compose exec php php bin/console $(CMD)

composer: ## Run a Composer command (usage: make composer CMD="require package")
	docker compose exec php composer $(CMD)
