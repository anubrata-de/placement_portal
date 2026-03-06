from flask import request, jsonify
from flask_login import current_user
from app import db
from app.company import bp
from app.models import CompanyProfile, PlacementDrive, Application, StudentProfile, Interview
from app.auth.decorators import company_required
from app import cache
from datetime import datetime

@bp.route('/profile', methods=['GET', 'POST'])
@company_required
def profile():
    profile = current_user.company_profile
    if request.method == 'GET':
        return jsonify({
            'company_name': profile.company_name,
            'hr_contact': profile.hr_contact,
            'website': profile.website,
            'approval_status': profile.approval_status
        })
    
    data = request.get_json()
    profile.company_name = data.get('company_name', profile.company_name)
    profile.hr_contact = data.get('hr_contact', profile.hr_contact)
    profile.website = data.get('website', profile.website)
    db.session.commit()
    return jsonify({'message': 'Profile updated successfully'})

@bp.route('/drives', methods=['GET', 'POST'])
@company_required
def drives():
    profile = current_user.company_profile
    if profile.approval_status != 'Approved':
        return jsonify({'error': 'Company profile not approved yet'}), 403

    if request.method == 'GET':
        drives = PlacementDrive.query.filter_by(company_id=profile.id).all()
        result = []
        for d in drives:
            result.append({
                'id': d.id,
                'job_title': d.job_title,
                'status': d.status,
                'deadline': d.application_deadline.isoformat() if d.application_deadline else None,
                'application_count': len(d.applications)
            })
        return jsonify(result)

    data = request.get_json()
    try:
        deadline = datetime.fromisoformat(data['application_deadline']) if data.get('application_deadline') else None
    except ValueError:
        return jsonify({'error': 'Invalid date format'}), 400

    drive = PlacementDrive(
        company_id=profile.id,
        job_title=data['job_title'],
        job_description=data.get('job_description'),
        eligibility_criteria=data.get('eligibility_criteria'),
        application_deadline=deadline,
        status='Pending' # Default to pending until Admin approves
    )
    db.session.add(drive)
    db.session.commit()
    return jsonify({'message': 'Drive created successfully, awaiting approval'})

@bp.route('/drives/<int:id>/applications', methods=['GET'])
@company_required
def get_drive_applications(id):
    profile = current_user.company_profile
    drive = PlacementDrive.query.filter_by(id=id, company_id=profile.id).first_or_404()
    
    result = []
    for app in drive.applications:
        student = app.student
        
        interviews_data = [{
            'id': i.id,
            'interview_date': i.interview_date.isoformat(),
            'interview_type': i.interview_type,
            'location': i.location,
            'notes': i.notes,
            'status': i.status
        } for i in app.interviews]
        
        result.append({
            'application_id': app.id,
            'student_name': student.user.username,
            'student_email': student.user.email,
            'branch': student.branch,
            'cgpa': student.cgpa,
            'resume_url': student.resume_url,
            'status': app.status,
            'application_date': app.application_date.isoformat(),
            'interviews': interviews_data
        })
    return jsonify(result)

@bp.route('/applications/<int:id>/status', methods=['POST'])
@company_required
def update_application_status(id):
    application = Application.query.get_or_404(id)
    if application.drive.company_id != current_user.company_profile.id:
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    new_status = data.get('status')
    if new_status not in ['Shortlisted', 'Selected', 'Rejected']:
        return jsonify({'error': 'Invalid status'}), 400
    
    application.status = new_status
    
    if new_status == 'Selected':
        application.student.placement_status = 'Placed'
        
    db.session.commit()
    cache.delete('admin_stats')
    return jsonify({'message': f'Application status updated to {new_status}'})

@bp.route('/applications/<int:id>/offer-letter', methods=['POST'])
@company_required
def generate_offer_letter(id):
    application = Application.query.get_or_404(id)
    if application.drive.company_id != current_user.company_profile.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    if application.status != 'Selected':
        return jsonify({'error': 'Candidate not selected'}), 400

    student = application.student
    company = application.drive.company
    drive = application.drive
    
    offer_html = f"""
    <html>
    <body>
        <h1>Offer Letter</h1>
        <p>Date: {datetime.now().strftime('%Y-%m-%d')}</p>
        <p>Dear {student.user.username},</p>
        <p>We are pleased to offer you the position of <strong>{drive.job_title}</strong> at <strong>{company.company_name}</strong>.</p>
        <p>Congratulations!</p>
        <p>Sincerely,</p>
        <p>{company.hr_contact}</p>
        <p>{company.company_name}</p>
    </body>
    </html>
    """
    
    return jsonify({'offer_letter': offer_html})

@bp.route('/applications/<int:id>/schedule-interview', methods=['POST'])
@company_required
def schedule_interview(id):
    """Schedule an interview for a student application"""
    application = Application.query.get_or_404(id)
    if application.drive.company_id != current_user.company_profile.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    if application.status not in ['Applied', 'Shortlisted']:
        return jsonify({'error': 'Can only schedule interviews for Applied or Shortlisted candidates'}), 400
    
    data = request.get_json()
    if not data.get('interview_date'):
        return jsonify({'error': 'Interview date is required'}), 400
    
    try:
        interview_date = datetime.fromisoformat(data['interview_date'])
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)'}), 400
    
    if application.status == 'Applied':
        application.status = 'Shortlisted'
    
    interview = Interview(
        application_id=application.id,
        interview_date=interview_date,
        interview_type=data.get('interview_type', 'Technical'),
        location=data.get('location', ''),
        notes=data.get('notes', ''),
        status='Scheduled'
    )
    db.session.add(interview)
    db.session.commit()
    cache.delete('admin_stats')
    
    return jsonify({
        'message': 'Interview scheduled successfully',
        'interview': {
            'id': interview.id,
            'interview_date': interview.interview_date.isoformat(),
            'interview_type': interview.interview_type,
            'location': interview.location,
            'status': interview.status
        }
    }), 201

@bp.route('/applications/<int:id>/interviews', methods=['GET'])
@company_required
def get_application_interviews(id):
    """Get all interviews for an application"""
    application = Application.query.get_or_404(id)
    if application.drive.company_id != current_user.company_profile.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    interviews = Interview.query.filter_by(application_id=application.id).all()
    result = []
    for interview in interviews:
        result.append({
            'id': interview.id,
            'interview_date': interview.interview_date.isoformat(),
            'interview_type': interview.interview_type,
            'location': interview.location,
            'notes': interview.notes,
            'status': interview.status,
            'created_at': interview.created_at.isoformat()
        })
    return jsonify(result)
