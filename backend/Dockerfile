FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=0

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Collect admin/DRF static files at build time (served by WhiteNoise).
RUN DJANGO_DEBUG=1 python manage.py collectstatic --noinput

RUN adduser --disabled-password --no-create-home app
USER app

EXPOSE 8000
# Content seeding is NOT done here: it is slow on a remote DB and would keep the API down. See `run.sh seed-prod`.
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --access-logfile -"]
