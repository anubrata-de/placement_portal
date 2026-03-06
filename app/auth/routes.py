from flask import request, jsonify, current_app
from flask_login import current_user, login_user, logout_user, login_required
from app import db
from app.auth import bp
from app.models import User, CompanyProfile, StudentProfile
from app.tasks import send_welcome_email

@bp.route('/login', methods=['POST'])
def login():
    if current_user.is_authenticated:
        return jsonify({'message': 'Already logged in', 'user': {'id': current_user.id, 'role': current_user.role}}), 200

    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Missing username or password'}), 400

    user = User.query.filter_by(username=data['username']).first()
    if user is None or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid username or password'}), 401
        
    if not user.is_active:
         return jsonify({'error': 'Account is deactivated. Contact admin.'}), 403
         
    if user.role == 'COMPANY' and user.company_profile and user.company_profile.is_blacklisted:
         return jsonify({'error': 'Company is blacklisted.'}), 403

    login_user(user)
    return jsonify({
        'message': 'Login successful',
        'user': {
            'username': user.username,
            'email': user.email,
            'role': user.role
        }
    })

@bp.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Logout successful'})

@bp.route('/register', methods=['POST'])
def register():
    if current_user.is_authenticated:
        return jsonify({'error': 'Already logged in'}), 400

    data = request.get_json()
    required_fields = ['username', 'email', 'password', 'role']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    if data['role'] not in ['COMPANY', 'STUDENT']:
         return jsonify({'error': 'Invalid role. Must be COMPANY or STUDENT'}), 400

    if User.query.filter((User.username == data['username']) | (User.email == data['email'])).first():
        return jsonify({'error': 'Username or Email already exists'}), 400

    user = User(username=data['username'], email=data['email'], role=data['role'])
    user.set_password(data['password'])
    db.session.add(user)
    db.session.flush() # Generate ID

    if data['role'] == 'COMPANY':
        profile = CompanyProfile(user_id=user.id, company_name=data.get('company_name', data['username']), approval_status='Pending')
        db.session.add(profile)
    elif data['role'] == 'STUDENT':
        profile = StudentProfile(user_id=user.id)
        db.session.add(profile)
    
    db.session.commit()
    
    send_welcome_email.delay(user.id)

    return jsonify({'message': 'Registration successful'}), 201

@bp.route('/status', methods=['GET'])
def auth_status():
    if current_user.is_authenticated:
        return jsonify({'is_authenticated': True, 'user': {'id': current_user.id, 'role': current_user.role, 'username': current_user.username}})
    return jsonify({'is_authenticated': False})
