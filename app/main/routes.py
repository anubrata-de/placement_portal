from flask import render_template
from app.main import bp

@bp.route('/', defaults={'path': ''})
@bp.route('/<path:path>')
def index(path):
    return render_template('index.html')
