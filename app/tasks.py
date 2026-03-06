from celery import shared_task
from flask import current_app, has_app_context
from flask_mail import Message
from datetime import datetime, timedelta
import csv
import io
import os
import requests
import json

def send_notification(email=None, phone=None, chat_webhook=None, subject=None, message=None, html=None, app=None):
    """Send notification via email, SMS, or Google Chat webhook
    
    Args:
        app: Optional Flask app instance. If not provided, will try to use current_app.
    """
    sent_via = []
    
    try:
        if app is None:
            if not has_app_context():
                print("Warning: send_notification called outside application context and no app provided")
                return []
            app_instance = current_app
        else:
            app_instance = app
    except RuntimeError:
        print("Warning: send_notification called outside application context")
        return []
    
    if email:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            mail_server = app_instance.config.get('MAIL_SERVER', 'localhost')
            mail_port = app_instance.config.get('MAIL_PORT', 587)
            mail_use_tls = app_instance.config.get('MAIL_USE_TLS', True)
            mail_username = app_instance.config.get('MAIL_USERNAME')
            mail_password = app_instance.config.get('MAIL_PASSWORD')
            mail_default_sender = app_instance.config.get('MAIL_DEFAULT_SENDER') or mail_username or 'noreply@placementportal.com'
            
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject or 'Placement Portal Notification'
            msg['From'] = mail_default_sender
            msg['To'] = email
            
            html_content = html or message
            if html:
                msg.attach(MIMEText(html_content, 'html'))
            print(f"DEBUG: Attempting to send email via SMTP to {mail_server}:{mail_port}")
            print(f"DEBUG: TLS enabled: {mail_use_tls}")
            print(f"DEBUG: Auth user: {mail_username}")
            
            with smtplib.SMTP(mail_server, mail_port) as server:
                server.set_debuglevel(1)
                print("DEBUG: SMTP connection established")
                if mail_use_tls:
                    try:
                        print("DEBUG: Attempting STARTTLS")
                        server.starttls()
                        print("DEBUG: STARTTLS successful")
                    except smtplib.SMTPNotSupportedError:
                        print("DEBUG: STARTTLS not supported by server (expected for MailHog)")
                        pass 
                if mail_username and mail_password:
                    print("DEBUG: Attempting login")
                    server.login(mail_username, mail_password)
                    print("DEBUG: Login successful")
                
                print("DEBUG: Sending message...")
                server.send_message(msg)
                print("DEBUG: Message sent successfully!")
            
            sent_via.append('email')
        except Exception as e:
            print(f"Failed to send email to {email}: {e}")
            import traceback
            traceback.print_exc()
    
    if chat_webhook and app_instance.config.get('GOOGLE_CHAT_WEBHOOK_URL'):
        try:
            payload = {
                "text": f"{subject or 'Notification'}\n\n{message or html}"
            }
            response = requests.post(
                app_instance.config['GOOGLE_CHAT_WEBHOOK_URL'],
                json=payload,
                timeout=10
            )
            if response.status_code == 200:
                sent_via.append('chat')
        except Exception as e:
            print(f"Failed to send chat message: {e}")
    
    if phone and app_instance.config.get('SMS_ENABLED'):
        try:
            print(f"SMS to {phone}: {message}")
            sent_via.append('sms')
        except Exception as e:
            print(f"Failed to send SMS: {e}")
    
    return sent_via

@shared_task(ignore_result=False)
def export_applications_csv(student_id):
    """Export student applications as CSV and notify user"""
    from app import create_app
    from app.models import User, Application
    app = create_app()
    
    with app.app_context():
        from app.models import db
        student_user = User.query.get(student_id)
        if not student_user or not student_user.student_profile:
            return {"status": "error", "message": "Student not found"}
        
        applications = student_user.student_profile.applications
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Student ID', 'Company Name', 'Drive Title', 'Status', 'Application Date'])
        
        for application in applications:
            writer.writerow([
                student_user.id,
                application.drive.company.company_name,
                application.drive.job_title,
                application.status,
                application.application_date.isoformat()
            ])
        
        csv_content = output.getvalue()
        
        export_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'exports')
        os.makedirs(export_dir, exist_ok=True)
        
        filename = f"applications_{student_user.id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        file_path = os.path.join(export_dir, filename)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(csv_content)
        
        download_url = f"/student/download-export/{filename}"
        message = f"Your application history has been exported successfully. File: {filename}"
        html = f"""
        <html>
        <body>
            <h2>Application Export Complete</h2>
            <p>Your placement application history has been exported successfully.</p>
            <p>File: <strong>{filename}</strong></p>
            <p>You can download it from your dashboard.</p>
        </body>
        </html>
        """
        
        send_notification(
            email=student_user.email,
            subject="Application Export Complete",
            message=message,
            html=html,
            app=app
        )
        
        return {
            "status": "success",
            "message": "CSV export completed",
            "filename": filename,
            "file_path": file_path
        }

@shared_task
def send_daily_reminders():
    """Send daily reminders about upcoming application deadlines"""
    from app import create_app
    from app.models import User, PlacementDrive, Application, StudentProfile, db
    app = create_app()
    
    with app.app_context():
        tomorrow = datetime.utcnow().date() + timedelta(days=1)
        drives = PlacementDrive.query.filter(
            PlacementDrive.status == 'Approved',
            db.func.date(PlacementDrive.application_deadline) == tomorrow
        ).all()
        
        if not drives:
            return f"No drives with deadlines tomorrow"
        
        reminders_sent = 0
        for drive in drives:
            students = User.query.filter_by(role='STUDENT', is_active=True).join(StudentProfile).all()
            
            for student in students:
                has_applied = Application.query.filter_by(
                    student_id=student.student_profile.id,
                    drive_id=drive.id
                ).first() is not None
                
                if not has_applied:
                    subject = f"Reminder: Application Deadline Tomorrow - {drive.job_title}"
                    message = f"""
                    Dear {student.username},
                    
                    This is a reminder that the application deadline for the following placement drive is tomorrow:
                    
                    Company: {drive.company.company_name}
                    Position: {drive.job_title}
                    Deadline: {drive.application_deadline.strftime('%Y-%m-%d %H:%M')}
                    
                    Don't miss this opportunity! Apply now through the placement portal.
                    """
                    
                    html = f"""
                    <html>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6;">
                        <h2>Application Deadline Reminder</h2>
                        <p>Dear {student.username},</p>
                        <p>This is a reminder that the application deadline for the following placement drive is <strong>tomorrow</strong>:</p>
                        <ul>
                            <li><strong>Company:</strong> {drive.company.company_name}</li>
                            <li><strong>Position:</strong> {drive.job_title}</li>
                            <li><strong>Deadline:</strong> {drive.application_deadline.strftime('%Y-%m-%d %H:%M')}</li>
                        </ul>
                        <p>Don't miss this opportunity! Apply now through the placement portal.</p>
                    </body>
                    </html>
                    """
                    
                    send_notification(
                        email=student.email,
                        chat_webhook=app.config.get('GOOGLE_CHAT_WEBHOOK_URL'),
                        subject=subject,
                        message=message,
                        html=html,
                        app=app
                    )
                    reminders_sent += 1
        
        return f"Reminders sent for {len(drives)} drives to {reminders_sent} students"

@shared_task
def generate_monthly_report():
    """Generate and send monthly placement activity report to admin
    
    This task runs on the first day of each month at 9 AM (configured in config.py).
    It generates a report for the PREVIOUS month's activity.
    
    Example: If run on March 1st, it generates a report for February.
    """
    from app import create_app
    from app.models import User, PlacementDrive, Application, StudentProfile, db
    app = create_app()
    
    with app.app_context():
        today = datetime.utcnow().date()
        first_day_this_month = today.replace(day=1)
        last_day_last_month = first_day_this_month - timedelta(days=1)
        first_day_last_month = last_day_last_month.replace(day=1)
        
        total_drives = PlacementDrive.query.count()
        drives_last_month = PlacementDrive.query.filter(
            PlacementDrive.created_at >= datetime.combine(first_day_last_month, datetime.min.time()),
            PlacementDrive.created_at < datetime.combine(first_day_this_month, datetime.min.time())
        ).count()
        
        total_applications = Application.query.count()
        applications_last_month = Application.query.filter(
            Application.application_date >= datetime.combine(first_day_last_month, datetime.min.time()),
            Application.application_date < datetime.combine(first_day_this_month, datetime.min.time())
        ).count()
        
        selected_students = Application.query.filter_by(status='Selected').count()
        selected_last_month = Application.query.filter(
            Application.status == 'Selected',
            Application.application_date >= datetime.combine(first_day_last_month, datetime.min.time()),
            Application.application_date < datetime.combine(first_day_this_month, datetime.min.time())
        ).count()
        
        shortlisted = Application.query.filter_by(status='Shortlisted').count()
        rejected = Application.query.filter_by(status='Rejected').count()
        
        placed_students = StudentProfile.query.filter_by(placement_status='Placed').count()
        unplaced_students = StudentProfile.query.filter_by(placement_status='Unplaced').count()
        
        report_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 800px; margin: 0 auto; padding: 20px; }}
                h1 {{ color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }}
                h2 {{ color: #34495e; margin-top: 30px; }}
                .stats-grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }}
                .stat-card {{ background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #3498db; }}
                .stat-number {{ font-size: 2em; font-weight: bold; color: #3498db; }}
                .stat-label {{ color: #666; margin-top: 5px; }}
                table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
                th {{ background-color: #3498db; color: white; }}
                tr:hover {{ background-color: #f5f5f5; }}
                .footer {{ margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; color: #666; font-size: 0.9em; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Monthly Placement Activity Report</h1>
                <p><strong>Report Period:</strong> {first_day_last_month.strftime('%B %Y')}</p>
                <p><strong>Generated:</strong> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC</p>
                
                <h2>Overall Statistics</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-number">{total_drives}</div>
                        <div class="stat-label">Total Placement Drives</div>
                        <div style="margin-top: 10px; font-size: 0.9em; color: #27ae60;">+{drives_last_month} this month</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{total_applications}</div>
                        <div class="stat-label">Total Applications</div>
                        <div style="margin-top: 10px; font-size: 0.9em; color: #27ae60;">+{applications_last_month} this month</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{selected_students}</div>
                        <div class="stat-label">Students Selected</div>
                        <div style="margin-top: 10px; font-size: 0.9em; color: #27ae60;">+{selected_last_month} this month</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">{placed_students}</div>
                        <div class="stat-label">Placed Students</div>
                    </div>
                </div>
                
                <h2>Application Status Breakdown</h2>
                <table>
                    <tr>
                        <th>Status</th>
                        <th>Count</th>
                    </tr>
                    <tr>
                        <td>Selected</td>
                        <td>{selected_students}</td>
                    </tr>
                    <tr>
                        <td>Shortlisted</td>
                        <td>{shortlisted}</td>
                    </tr>
                    <tr>
                        <td>Rejected</td>
                        <td>{rejected}</td>
                    </tr>
                    <tr>
                        <td>Applied</td>
                        <td>{total_applications - selected_students - shortlisted - rejected}</td>
                    </tr>
                </table>
                
                <h2>Student Placement Status</h2>
                <table>
                    <tr>
                        <th>Status</th>
                        <th>Count</th>
                    </tr>
                    <tr>
                        <td>Placed</td>
                        <td>{placed_students}</td>
                    </tr>
                    <tr>
                        <td>Unplaced</td>
                        <td>{unplaced_students}</td>
                    </tr>
                </table>
                
                <div class="footer">
                    <p>This is an automated monthly report from the Placement Portal.</p>
                    <p>For questions or concerns, please contact the system administrator.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        admin = User.query.filter_by(role='ADMIN').first()
        if admin:
            send_notification(
                email=admin.email,
                subject=f"Monthly Placement Report - {first_day_last_month.strftime('%B %Y')}",
                html=report_html,
                app=app
            )
            return f"Monthly report sent to admin ({admin.email})"
        else:
            return "No admin user found to send report to"

@shared_task
def send_welcome_email(user_id):
    """Send welcome email to newly registered users"""
    from app import create_app
    from app.models import User
    app = create_app()
    
    with app.app_context():
        user = User.query.get(user_id)
        if not user:
            return f"User {user_id} not found"
            
        subject = "Welcome to the Placement Portal!"
        
        if user.role == 'STUDENT':
            message = f"Welcome {user.username}! Your student account has been created successfully."
            html = f"""
            <html>
            <body>
                <h2>Welcome to Placement Portal</h2>
                <p>Hi <strong>{user.username}</strong>,</p>
                <p>Your student account has been created successfully. You can now complete your profile and apply for upcoming placement drives.</p>
            </body>
            </html>
            """
        elif user.role == 'COMPANY':
            message = f"Welcome {user.username}! Your company registration is pending admin approval."
            html = f"""
            <html>
            <body>
                <h2>Welcome to Placement Portal</h2>
                <p>Hi <strong>{user.username}</strong>,</p>
                <p>Your company account has been created successfully. <strong>Your profile is currently pending admin approval</strong>.</p>
                <p>You will be notified once your account is approved and you can start posting placement drives.</p>
            </body>
            </html>
            """
        else:
            return f"Invalid role for welcome email: {user.role}"
            
        send_notification(
            email=user.email,
            subject=subject,
            message=message,
            html=html,
            app=app
        )
        return f"Welcome email sent to {user.email}"
