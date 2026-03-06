import os
from datetime import timedelta
from celery.schedules import crontab

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///app.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    MAIL_SERVER = os.environ.get('MAIL_SERVER') or 'localhost'
    MAIL_PORT = int(os.environ.get('MAIL_PORT') or 1025)
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'false').lower() in ['true', 'on', '1']
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER') or 'noreply@placementportal.com'
    
    GOOGLE_CHAT_WEBHOOK_URL = os.environ.get('GOOGLE_CHAT_WEBHOOK_URL')
    
    SMS_ENABLED = os.environ.get('SMS_ENABLED', 'false').lower() in ['true', 'on', '1']
    SMS_API_KEY = os.environ.get('SMS_API_KEY')
    
    CELERY = dict(
        broker_url=os.environ.get('CELERY_BROKER_URL') or 'redis://localhost:6379/0',
        result_backend=os.environ.get('CELERY_RESULT_BACKEND') or 'redis://localhost:6379/0',
        task_ignore_result=True,
        beat_schedule={
            'daily-reminders': {
                'task': 'app.tasks.send_daily_reminders',
                'schedule': 86400.0,
            },
            'monthly-report': {
                'task': 'app.tasks.generate_monthly_report',
                'schedule': crontab(hour=9, minute=0, day_of_month='1'),
            },
        }
    )
    
    CACHE_TYPE = "RedisCache"
    CACHE_REDIS_URL = os.environ.get('CELERY_BROKER_URL') or 'redis://localhost:6379/0'
    CACHE_DEFAULT_TIMEOUT = 300
