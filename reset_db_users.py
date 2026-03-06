import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import User, CompanyProfile, StudentProfile, PlacementDrive, Application

app = create_app()

def reset_users():
    with app.app_context():
        print("Starting DB cleanup...")
        
        # 1. Delete all Applications
        num_apps = Application.query.delete()
        print(f"Deleted {num_apps} applications.")
        
        # 2. Delete all Placement Drives
        num_drives = PlacementDrive.query.delete()
        print(f"Deleted {num_drives} placement drives.")
        
        # 3. Delete all Company Profiles
        num_comp = CompanyProfile.query.delete()
        print(f"Deleted {num_comp} company profiles.")
        
        # 4. Delete all Student Profiles
        num_stud = StudentProfile.query.delete()
        print(f"Deleted {num_stud} student profiles.")
        
        # 5. Delete all Users except ADMIN
        num_users = User.query.filter(User.role != 'ADMIN').delete()
        print(f"Deleted {num_users} users.")
        
        db.session.commit()
        print("Cleanup complete. Only Admin remains.")
        
        # Verify
        users = User.query.all()
        print("Remaining Users:")
        for u in users:
            print(f"- {u.username} ({u.role})")

if __name__ == "__main__":
    reset_users()
