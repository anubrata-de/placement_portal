from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import MetaData
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

convention = {
    "ix": 'ix_%(column_0_label)s',
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}

metadata = MetaData(naming_convention=convention)
db = SQLAlchemy(metadata=metadata)

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    role = db.Column(db.String(20), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    company_profile = db.relationship('CompanyProfile', backref='user', uselist=False)
    student_profile = db.relationship('StudentProfile', backref='user', uselist=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self):
        return self.role == 'ADMIN'

def load_user(id):
    return User.query.get(int(id))

class CompanyProfile(db.Model):
    __tablename__ = 'company_profiles'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    company_name = db.Column(db.String(120), nullable=False)
    hr_contact = db.Column(db.String(120))
    website = db.Column(db.String(200))
    approval_status = db.Column(db.String(20), default='Pending')
    is_blacklisted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    drives = db.relationship('PlacementDrive', backref='company', lazy=True)

class StudentProfile(db.Model):
    __tablename__ = 'student_profiles'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    branch = db.Column(db.String(50))
    cgpa = db.Column(db.Float)
    year_of_study = db.Column(db.Integer)
    resume_url = db.Column(db.String(255))
    placement_status = db.Column(db.String(50), default='Unplaced')

    applications = db.relationship('Application', backref='student', lazy=True)

class PlacementDrive(db.Model):
    __tablename__ = 'placement_drives'
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('company_profiles.id'), nullable=False)
    job_title = db.Column(db.String(100), nullable=False)
    job_description = db.Column(db.Text)
    eligibility_criteria = db.Column(db.Text)
    application_deadline = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='Pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    applications = db.relationship('Application', backref='drive', lazy=True)

class Application(db.Model):
    __tablename__ = 'applications'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student_profiles.id'), nullable=False)
    drive_id = db.Column(db.Integer, db.ForeignKey('placement_drives.id'), nullable=False)
    application_date = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='Applied')

    __table_args__ = (
        db.UniqueConstraint('student_id', 'drive_id', name='uq_student_drive_application'),
    )
    
    interviews = db.relationship('Interview', backref='application', lazy=True)

class Interview(db.Model):
    __tablename__ = 'interviews'
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey('applications.id'), nullable=False)
    interview_date = db.Column(db.DateTime, nullable=False)
    interview_type = db.Column(db.String(50))
    location = db.Column(db.String(200))
    notes = db.Column(db.Text)
    status = db.Column(db.String(20), default='Scheduled')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)