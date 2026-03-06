from flask import Flask
from werkzeug.security import generate_password_hash
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_caching import Cache
from flask_mail import Mail
from .models import db, User
from config import Config
from .celery_utils import celery_init_app

migrate = Migrate()
login = LoginManager()
login.login_view = 'auth.login'
cache = Cache()
mail = Mail()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    login.init_app(app)
    
    from .models import load_user
    login.user_loader(load_user)
    
    celery_init_app(app)
    cache.init_app(app)
    mail.init_app(app)

    from app.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    from app.admin import bp as admin_bp
    app.register_blueprint(admin_bp, url_prefix='/admin')

    from app.company import bp as company_bp
    app.register_blueprint(company_bp, url_prefix='/company')

    from app.student import bp as student_bp
    app.register_blueprint(student_bp, url_prefix='/student')

    from app.main import bp as main_bp
    app.register_blueprint(main_bp)

    return app

def init_db(app):
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(role='ADMIN').first():
            admin = User(
                username='admin',
                email='admin@example.com',
                password_hash=generate_password_hash('admin123'),
                role='ADMIN'
            )
            db.session.add(admin)
            db.session.commit()
            print("Admin user created.")
        else:
            print("Admin user already exists.")
