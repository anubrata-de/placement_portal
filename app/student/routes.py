from flask import request, jsonify, send_from_directory
from flask_login import current_user
from werkzeug.utils import secure_filename
from app import db, cache
from app.student import bp
from app.models import StudentProfile, PlacementDrive, Application, Interview
from app.auth.decorators import student_required
from app.tasks import export_applications_csv
from app import db, cache
from datetime import datetime
from sqlalchemy.exc import IntegrityError
import json
import re
import os

def _check_eligibility(student, drive):
    """Check if student meets eligibility criteria for a drive"""
    if not drive.eligibility_criteria:
        return True
    
    criteria = drive.eligibility_criteria
    
    try:
        criteria_dict = json.loads(criteria)
        if 'min_cgpa' in criteria_dict and student.cgpa:
            if student.cgpa < criteria_dict['min_cgpa']:
                return False
        if 'branches' in criteria_dict and student.branch:
            if student.branch not in criteria_dict['branches']:
                return False
        if 'min_year' in criteria_dict and student.year_of_study:
            if student.year_of_study < criteria_dict['min_year']:
                return False
        return True
    except (json.JSONDecodeError, ValueError):
        if student.cgpa:
            cgpa_patterns = [
                r'CGPA\s*>=\s*([\d.]+)',
                r'CGPA\s*>\s*([\d.]+)',
                r'minimum\s+CGPA[:\s]+([\d.]+)',
                r'CGPA[:\s]+([\d.]+)',
            ]
            for pattern in cgpa_patterns:
                match = re.search(pattern, criteria, re.IGNORECASE)
                if match:
                    min_cgpa = float(match.group(1))
                    if student.cgpa < min_cgpa:
                        return False
        
        if student.branch:
            branch_pattern = rf'\b{re.escape(student.branch)}\b'
            if not re.search(branch_pattern, criteria, re.IGNORECASE):
                branch_keywords = ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'IT']
                if any(kw in criteria.upper() for kw in branch_keywords):
                    return False
        
        return True

@bp.route('/profile', methods=['GET', 'POST'])
@student_required
def profile():
    profile = current_user.student_profile
    if request.method == 'GET':
        return jsonify({
            'branch': profile.branch,
            'cgpa': profile.cgpa,
            'year_of_study': profile.year_of_study,
            'resume_url': profile.resume_url,
            'placement_status': profile.placement_status
        })

    data = request.get_json()
    profile.branch = data.get('branch', profile.branch)
    profile.cgpa = data.get('cgpa', profile.cgpa)
    profile.year_of_study = data.get('year_of_study', profile.year_of_study)
    profile.resume_url = data.get('resume_url', profile.resume_url)
    
    db.session.commit()
    return jsonify({'message': 'Profile updated successfully'})

@bp.route('/upload-resume', methods=['POST'])
@student_required
def upload_resume():
    """Upload resume file"""
    if 'resume' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['resume']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    allowed_extensions = {'pdf', 'doc', 'docx'}
    filename = secure_filename(file.filename)
    if '.' not in filename or filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
        return jsonify({'error': 'Invalid file type. Allowed: PDF, DOC, DOCX'}), 400
    
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads', 'resumes')
    os.makedirs(upload_dir, exist_ok=True)
    
    file_extension = filename.rsplit('.', 1)[1].lower()
    new_filename = f"resume_{current_user.id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{file_extension}"
    file_path = os.path.join(upload_dir, new_filename)
    file.save(file_path)
    
    profile = current_user.student_profile
    profile.resume_url = f"/student/resume/{new_filename}"
    db.session.commit()
    
    return jsonify({
        'message': 'Resume uploaded successfully',
        'resume_url': profile.resume_url
    })

@bp.route('/resume/<filename>', methods=['GET'])
@student_required
def get_resume(filename):
    """Download resume file"""
    if not filename.startswith(f"resume_{current_user.id}_"):
        return jsonify({'error': 'Unauthorized'}), 403
    
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads', 'resumes')
    return send_from_directory(upload_dir, filename)

@bp.route('/drives', methods=['GET'])
@student_required
def drives():
    drives = PlacementDrive.query.filter_by(status='Approved').all()
    result = []
    
    applied_drive_ids = [app.drive_id for app in current_user.student_profile.applications]

    for d in drives:
        if d.application_deadline and d.application_deadline < datetime.utcnow():
            continue
        
        is_eligible = _check_eligibility(current_user.student_profile, d)
            
        result.append({
            'id': d.id,
            'company_name': d.company.company_name,
            'job_title': d.job_title,
            'job_description': d.job_description,
            'eligibility_criteria': d.eligibility_criteria,
            'deadline': d.application_deadline.isoformat() if d.application_deadline else None,
            'is_applied': d.id in applied_drive_ids,
            'is_eligible': is_eligible
        })
        
    return jsonify(result)

@bp.route('/apply/<int:drive_id>', methods=['POST'])
@student_required
def apply(drive_id):
    student = current_user.student_profile
    
    missing = []
    if not student.branch: missing.append("Branch")
    if student.cgpa is None: missing.append("CGPA")
    if student.year_of_study is None: missing.append("Year of Study")
    
    if missing:
         return jsonify({'error': f'Please complete your profile before applying. Missing: {", ".join(missing)}'}), 400
    
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.status != 'Approved':
        return jsonify({'error': 'Drive is not active'}), 400
        
    if drive.application_deadline and drive.application_deadline < datetime.utcnow():
         return jsonify({'error': 'Application deadline has passed'}), 400

    if not _check_eligibility(student, drive):
        return jsonify({'error': 'You do not meet the eligibility criteria for this drive'}), 400

    application = Application(student_id=student.id, drive_id=drive.id)
    try:
        db.session.add(application)
        db.session.commit()
        cache.delete('admin_stats')
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Already applied to this drive'}), 400
        
    return jsonify({'message': 'Applied successfully'})

@bp.route('/applications', methods=['GET'])
@student_required
def my_applications():
    apps = current_user.student_profile.applications
    result = []
    for app in apps:
        upcoming_interviews = Interview.query.filter_by(
            application_id=app.id,
            status='Scheduled'
        ).filter(Interview.interview_date >= datetime.utcnow()).all()
        
        interviews_data = [{
            'id': i.id,
            'interview_date': i.interview_date.isoformat(),
            'interview_type': i.interview_type,
            'location': i.location,
            'notes': i.notes
        } for i in upcoming_interviews]
        
        result.append({
            'id': app.id,
            'company_name': app.drive.company.company_name,
            'job_title': app.drive.job_title,
            'status': app.status,
            'applied_on': app.application_date.isoformat(),
            'application_id': app.id,
            'interviews': interviews_data
        })
    return jsonify(result)

@bp.route('/applications/<int:application_id>/offer-letter', methods=['GET'])
@student_required
def get_offer_letter(application_id):
    app = Application.query.get_or_404(application_id)
    
    if app.student_id != current_user.student_profile.id:
        return jsonify({'error': 'Unauthorized'}), 403
        
    if app.status != 'Selected':
        return jsonify({'error': 'Offer letter not available yet'}), 400
        
    student_name = app.student.user.username
    company_name = app.drive.company.company_name
    job_title = app.drive.job_title
    date = datetime.now().strftime("%Y-%m-%d")
    
    offer_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
        <h1 style="text-align: center; color: #2c3e50;">OFFER LETTER</h1>
        <hr>
        <p><strong>Date:</strong> {date}</p>
        <p><strong>To,</strong><br>{student_name}</p>
        
        <p>Dear {student_name},</p>
        
        <p>We are pleased to offer you the position of <strong>{job_title}</strong> at <strong>{company_name}</strong>.</p>
        
        <p>Your skills and experience impressed us, and we are confident that you will be a valuable asset to our team.</p>
        
        <p>Please accept this letter as a formal offer of employment.</p>
        
        <br>
        <p>Sincerely,</p>
        <p><strong>HR Department</strong><br>{company_name}</p>
    </body>
    </html>
    """
    
    return jsonify({'offer_letter': offer_content})

@bp.route('/export', methods=['POST'])
@student_required
def export_data():
    """Trigger an async task to export student applications to CSV"""
    task = export_applications_csv.delay(current_user.id)
    
    return jsonify({
        'status': 'queued', 
        'task_id': task.id,
        'message': 'Export started. You will be notified when it is complete.'
    })

@bp.route('/export/status/<task_id>', methods=['GET'])
@student_required
def export_status(task_id):
    """Check the status of the CSV export task"""
    task = export_applications_csv.AsyncResult(task_id)
    if task.state == 'PENDING':
        return jsonify({'status': 'pending'})
    elif task.state != 'FAILURE':
        return jsonify({
            'status': 'completed', 
            'result': task.result
        })
    else:
        return jsonify({
            'status': 'error', 
            'error': str(task.info)
        })

@bp.route('/download-export/<filename>', methods=['GET'])
@student_required
def download_export(filename):
    """Download exported CSV file"""
    if not filename.startswith(f"applications_{current_user.id}_"):
        return jsonify({'error': 'Unauthorized'}), 403
    
    export_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'exports')
    return send_from_directory(export_dir, filename, as_attachment=True)
