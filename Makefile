.PHONY: install lint test test-backend test-frontend build migrate dev

install:
	cd backend && pip install -e ".[dev]"
	cd frontend && pnpm install

lint:
	cd backend && python -m ruff check app/ tests/
	cd frontend && npx oxlint src/

test-backend:
	cd backend && python -m pytest -v

test-frontend:
	cd frontend && npx vitest run

test: test-backend test-frontend

build:
	cd frontend && npx vite build

migrate:
	cd backend && alembic upgrade head

dev-backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && pnpm dev
