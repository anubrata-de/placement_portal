from flask import request, jsonify
from app import db, cache
from app.admin import bp
from app.auth.decorators import admin_required
from app import cache
from app.models import User, CompanyProfile, StudentProfile, PlacementDrive, Application
from datetime import datetime

@bp.route('/stats', methods=['GET'])
@admin_required
def get_stats():
    student_count = User.query.filter_by(role='STUDENT').count()
    company_count = User.query.filter_by(role='COMPANY').count()
    drive_count = PlacementDrive.query.count()
    return jsonify({
        'students': student_count,
        'companies': company_count,
        'drives': drive_count
    })

@bp.route('/companies/pending', methods=['GET'])
@admin_required
def get_pending_companies():
    companies = CompanyProfile.query.filter_by(approval_status='Pending').all()
    result = []
    for c in companies:
        result.append({
            'id': c.id,
            'company_name': c.company_name,
            'email': c.user.email,
            'website': c.website,
            'hr_contact': c.hr_contact
        })
    return jsonify(result)

@bp.route('/companies', methods=['GET'])
@admin_required
def get_companies():
    companies = CompanyProfile.query.all()
    result = []
    for c in companies:
        result.append({
            'id': c.id,
            'company_name': c.company_name,
            'email': c.user.email,
            'website': c.website,
            'hr_contact': c.hr_contact,
            'approval_status': c.approval_status,
            'is_blacklisted': c.is_blacklisted
        })
    return jsonify(result)

@bp.route('/companies/<int:id>/verify', methods=['POST'])
@admin_required
def verify_company(id):
    data = request.get_json()
    action = data.get('action') # 'approve' or 'reject'
    
    company = CompanyProfile.query.get_or_404(id)
    if action == 'approve':
        company.approval_status = 'Approved'
    elif action == 'reject':
        company.approval_status = 'Rejected'
    else:
        return jsonify({'error': 'Invalid action'}), 400
        
    db.session.commit()
    return jsonify({'message': f'Company {action}d successfully'})

@bp.route('/drives/pending', methods=['GET'])
@admin_required
def get_pending_drives():
    drives = PlacementDrive.query.filter_by(status='Pending').all()
    result = []
    for d in drives:
        result.append({
            'id': d.id,
            'company_name': d.company.company_name,
            'job_title': d.job_title,
            'application_deadline': d.application_deadline.isoformat() if d.application_deadline else None
        })
    return jsonify(result)

@bp.route('/drives/<int:id>/verify', methods=['POST'])
@admin_required
def verify_drive(id):
    data = request.get_json()
    action = data.get('action')
    
    drive = PlacementDrive.query.get_or_404(id)
    if action == 'approve':
        drive.status = 'Approved'
    elif action == 'reject':
        drive.status = 'Rejected'
    else:
        return jsonify({'error': 'Invalid action'}), 400
        
    db.session.commit()
    cache.delete('all_drives')
    return jsonify({'message': f'Drive {action}d successfully'})

@bp.route('/drives', methods=['GET'])
@admin_required
@cache.cached(timeout=300, key_prefix='all_drives')
def get_all_drives():
    drives = PlacementDrive.query.all()
    result = []
    for d in drives:
        result.append({
            'id': d.id,
            'company_name': d.company.company_name,
            'job_title': d.job_title,
            'job_description': d.job_description,
            'eligibility_criteria': d.eligibility_criteria,
            'status': d.status,
            'application_deadline': d.application_deadline.isoformat() if d.application_deadline else None
        })
    return jsonify(result)

@bp.route('/drives/<int:id>', methods=['PUT'])
@admin_required
def update_drive_details(id):
    drive = PlacementDrive.query.get_or_404(id)
    data = request.get_json()
    
    if 'job_title' in data:
        drive.job_title = data['job_title']
    if 'job_description' in data:
        drive.job_description = data['job_description']
    if 'eligibility_criteria' in data:
        drive.eligibility_criteria = data['eligibility_criteria']
    if 'status' in data:
        drive.status = data['status']
    if 'application_deadline' in data and data['application_deadline']:
        try:
            drive.application_deadline = datetime.fromisoformat(data['application_deadline'].replace('Z', '+00:00'))
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid date format'}), 400
            
    db.session.commit()
    cache.delete('all_drives')
    return jsonify({'message': 'Drive updated successfully'})

@bp.route('/drives/<int:id>', methods=['DELETE'])
@admin_required
def delete_drive(id):
    drive = PlacementDrive.query.get_or_404(id)
    
    from app.models import Interview
    applications = Application.query.filter_by(drive_id=id).all()
    for app in applications:
        Interview.query.filter_by(application_id=app.id).delete()
        db.session.delete(app)
        
    db.session.delete(drive)
    db.session.commit()
    cache.delete('all_drives')
    return jsonify({'message': 'Drive deleted successfully'})

@bp.route('/students', methods=['GET'])
@admin_required
def get_students():
    students = StudentProfile.query.all()
    result = []
    for s in students:
        result.append({
            'id': s.id,
            'user_id': s.user.id,
            'name': s.user.username,
            'email': s.user.email,
            'branch': s.branch,
            'cgpa': s.cgpa,
            'status': s.placement_status,
            'is_active': s.user.is_active
        })
    return jsonify(result)

@bp.route('/users/<int:id>/toggle_status', methods=['POST'])
@admin_required
def toggle_user_status(id):
    user = User.query.get_or_404(id)
    if user.role == 'ADMIN':
         return jsonify({'error': 'Cannot disable admin'}), 400
         
    user.is_active = not user.is_active
    db.session.commit()
    return jsonify({'message': f"User {'activated' if user.is_active else 'deactivated'} successfully", 'is_active': user.is_active})

@bp.route('/companies/<int:id>/toggle_blacklist', methods=['POST'])
@admin_required
def toggle_company_blacklist(id):
    company = CompanyProfile.query.get_or_404(id)
    company.is_blacklisted = not company.is_blacklisted
    db.session.commit()
    return jsonify({'message': f"Company {'blacklisted' if company.is_blacklisted else 'whitelisted'} successfully", 'is_blacklisted': company.is_blacklisted})

@bp.route('/search/companies', methods=['GET'])
@admin_required
def search_companies():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Search query required'}), 400
    
    companies = CompanyProfile.query.join(User).filter(
        (CompanyProfile.company_name.ilike(f'%{query}%')) |
        (User.email.ilike(f'%{query}%')) |
        (CompanyProfile.hr_contact.ilike(f'%{query}%'))
    ).all()
    
    result = []
    for c in companies:
        result.append({
            'id': c.id,
            'company_name': c.company_name,
            'email': c.user.email,
            'website': c.website,
            'hr_contact': c.hr_contact,
            'approval_status': c.approval_status,
            'is_blacklisted': c.is_blacklisted
        })
    return jsonify(result)

@bp.route('/search/students', methods=['GET'])
@admin_required
def search_students():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Search query required'}), 400
    
    students = StudentProfile.query.join(User).filter(
        (User.username.ilike(f'%{query}%')) |
        (User.email.ilike(f'%{query}%')) |
        (StudentProfile.branch.ilike(f'%{query}%'))
    ).all()
    
    result = []
    for s in students:
        result.append({
            'id': s.id,
            'user_id': s.user.id,
            'name': s.user.username,
            'email': s.user.email,
            'branch': s.branch,
            'cgpa': s.cgpa,
            'status': s.placement_status,
            'is_active': s.user.is_active
        })
    return jsonify(result)

@bp.route('/applications', methods=['GET'])
@admin_required
def get_all_applications():
    """Admin can view all student applications"""
    applications = Application.query.all()
    result = []
    for app in applications:
        result.append({
            'id': app.id,
            'student_name': app.student.user.username,
            'student_email': app.student.user.email,
            'company_name': app.drive.company.company_name,
            'job_title': app.drive.job_title,
            'status': app.status,
            'application_date': app.application_date.isoformat(),
            'student_branch': app.student.branch,
            'student_cgpa': app.student.cgpa
        })
    return jsonify(result)

@bp.route('/reports/statistics', methods=['GET'])
@admin_required
@cache.cached(timeout=300, key_prefix='admin_stats')
def get_detailed_statistics():
    """Detailed placement statistics for admin"""
    total_students = User.query.filter_by(role='STUDENT').count()
    total_companies = User.query.filter_by(role='COMPANY').count()
    total_drives = PlacementDrive.query.count()
    approved_drives = PlacementDrive.query.filter_by(status='Approved').count()
    pending_drives = PlacementDrive.query.filter_by(status='Pending').count()
    
    total_applications = Application.query.count()
    shortlisted = Application.query.filter_by(status='Shortlisted').count()
    selected = Application.query.filter_by(status='Selected').count()
    rejected = Application.query.filter_by(status='Rejected').count()
    
    placed_students = StudentProfile.query.filter_by(placement_status='Placed').count()
    unplaced_students = StudentProfile.query.filter_by(placement_status='Unplaced').count()
    
    approved_companies = CompanyProfile.query.filter_by(approval_status='Approved').count()
    pending_companies = CompanyProfile.query.filter_by(approval_status='Pending').count()
    blacklisted_companies = CompanyProfile.query.filter_by(is_blacklisted=True).count()
    
    return jsonify({
        'students': {
            'total': total_students,
            'placed': placed_students,
            'unplaced': unplaced_students
        },
        'companies': {
            'total': total_companies,
            'approved': approved_companies,
            'pending': pending_companies,
            'blacklisted': blacklisted_companies
        },
        'drives': {
            'total': total_drives,
            'approved': approved_drives,
            'pending': pending_drives
        },
        'applications': {
            'total': total_applications,
            'shortlisted': shortlisted,
            'selected': selected,
            'rejected': rejected,
            'applied': total_applications - shortlisted - selected - rejected
        }
    })