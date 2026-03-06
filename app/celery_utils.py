from celery import Celery, Task
from flask import Flask

class FlaskTask(Task):
    """Custom Celery Task that ensures Flask app context is available"""
    def __call__(self, *args, **kwargs):
        return self.run(*args, **kwargs)

def celery_init_app(app: Flask) -> Celery:
    celery_app = Celery(app.name, task_cls=FlaskTask)
    celery_app.config_from_object(app.config["CELERY"])
    celery_app.set_default()
    app.extensions["celery"] = celery_app
    return celery_app
