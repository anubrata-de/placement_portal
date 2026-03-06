from flask import Blueprint

bp = Blueprint('company', __name__)

from app.company import routes
