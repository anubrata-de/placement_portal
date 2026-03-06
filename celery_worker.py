from app import create_app
from app.celery_utils import celery_init_app

app = create_app()
celery_app = app.extensions.get("celery", celery_init_app(app))
