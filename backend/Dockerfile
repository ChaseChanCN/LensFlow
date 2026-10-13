FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir -i https://repo.huaweicloud.com/repository/pypi/simple/ \
    fastapi uvicorn[standard] "pydantic[email]" pydantic-settings sqlalchemy alembic \
    python-jose[cryptography] passlib[bcrypt] "bcrypt<4.0.0" httpx python-multipart \
    opencv-python-headless numpy Pillow \
    "asyncpg>=0.29.0" psycopg2-binary

COPY . /app

RUN pip install --no-cache-dir -e .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
