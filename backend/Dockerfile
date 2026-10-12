FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir -i https://repo.huaweicloud.com/repository/pypi/simple/ \
    fastapi uvicorn[standard] pydantic pydantic-settings sqlalchemy alembic \
    python-jose[cryptography] passlib[bcrypt] httpx python-multipart \
    opencv-python-headless numpy

COPY . /app

RUN pip install --no-cache-dir -e .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
