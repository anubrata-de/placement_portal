<!-- portfolio
title: Placement Portal Application (PPA)
tagline: Role-Based Recruitment Management System
category: Full-stack apps
summary: Lets admins, companies and students run campus recruitment: placement drives, applications, eligibility filtering, automated reminders, monthly reports and CSV export.
tags: Flask, Vue.js, SQLite, Redis, Celery
slug: placement-portal
featured: yes
-->

# Placement Portal V2

A comprehensive placement management system built with Flask and Vue.js for managing student placements, company registrations, and placement drives.

## Features

- **Three User Roles**: Admin, Company, and Student
- **Company Management**: Registration, approval, and placement drive creation
- **Student Applications**: Profile management, drive applications, and status tracking
- **Admin Dashboard**: Complete oversight with approvals, search, and statistics
- **Background Jobs**: Daily reminders, monthly reports, and CSV exports
- **Caching**: Redis-based caching for improved performance

## Tech Stack

- **Backend**: Flask 3.0, SQLAlchemy, Celery, Redis
- **Frontend**: Vue.js 3, Bootstrap 5
- **Database**: SQLite (development)
- **Task Queue**: Celery with Redis

## Quick Start

### Prerequisites

- Python 3.8 to 3.12 (recommended) or Python 3.13+ (requires SQLAlchemy 2.0.25+ and typing-extensions 4.12.0+)
- Redis server
- pip

**Note:** Python 3.13 users need SQLAlchemy 2.0.25+ and typing-extensions 4.12.0+ for compatibility.

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd placement_portal_v2
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # Linux/Mac
   source venv/bin/activate
   ```

3. **Install dependencies**
   
   ```bash
   pip install -r requirements.txt
   ```
   
   **Windows users:** If you encounter `greenlet` build errors, install it separately first:
   ```powershell
   pip install greenlet --only-binary :all:
   pip install -r requirements.txt
   ```
   
   **Python 3.13 users:** Ensure compatibility packages are installed:
   ```bash
   pip install --upgrade "SQLAlchemy>=2.0.25" "typing-extensions>=4.12.0"
   pip install -r requirements.txt
   ```

4. **Start Redis**
   ```bash
   redis-server
   ```

5. **Initialize database**
   ```bash
   python init_db.py
   ```

6. **Start the Application Stack (Windows)**
   
   You need four terminals running simultaneously to support the web UI, background workers, scheduled tasks, and email testing:
   
   **Terminal 1: MailHog (Email Testing)**
   ```powershell
   .\mailhog.exe
   ```
   *(Make sure you downloaded [MailHog for Windows](https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_windows_amd64.exe) as `mailhog.exe` first)*

   **Terminal 2: Celery Worker**
   ```powershell
   .\venv\Scripts\activate
   celery -A celery_worker.celery_app worker --loglevel=info --pool=solo
   ```
   *(The `--pool=solo` flag is strictly required on Windows)*

   **Terminal 3: Celery Beat Scheduler**
   ```powershell
   .\venv\Scripts\activate
   celery -A celery_worker.celery_app beat --loglevel=info
   ```
   *(Required for daily/monthly tasks. The worker and beat scheduler must run in separate terminals on Windows)*

   **Terminal 4: Flask Web Server**
   ```powershell
   .\venv\Scripts\activate
   python run.py
   ```

7. **Access the application**
   - Main App: [http://localhost:5000](http://localhost:5000)
   - MailInbox: [http://localhost:8025/](http://localhost:8025/)
   - Login as admin: `admin` / `admin123`

## Verify Installation

After installing dependencies, verify everything is set up correctly:

```bash
python verify_dependencies.py
```

## Project Structure

```
placement_portal_v2/
├── app/
│   ├── admin/          # Admin routes and functionality
│   ├── auth/           # Authentication and authorization
│   ├── company/        # Company management
│   ├── student/        # Student management
│   ├── main/           # Main routes
│   ├── static/         # Frontend assets (Vue.js, CSS)
│   ├── templates/      # HTML templates
│   ├── models.py       # Database models
│   ├── tasks.py        # Celery background tasks
│   └── __init__.py
├── config.py           # Application configuration
├── run.py              # Application entry point
├── init_db.py          # Database initialization
├── celery_worker.py    # Celery configuration
├── requirements.txt    # Python dependencies
├── verify_dependencies.py
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## Default Credentials

- **Admin**: 
  - Username: `admin`
  - Password: `admin123`

## Key Features

### Admin Features
- Approve/reject company registrations
- Approve/reject placement drives
- View all students, companies, and applications
- Search functionality
- Blacklist/deactivate users
- View statistics and reports

### Company Features
- Register company profile
- Create placement drives (after approval)
- View and manage student applications
- Shortlist and select students
- Schedule interviews
- Generate offer letters

### Student Features
- Register and manage profile
- View approved placement drives
- Apply for drives (with eligibility validation)
- View application status
- Upload resume
- Export application history as CSV

## Background Jobs

- **Daily Reminders**: Sends reminders about upcoming application deadlines
- **Monthly Reports**: Generates and emails monthly placement activity reports
- **CSV Export**: Async export of student application history

## Configuration

Create a `.env` file in the root directory (optional):

```env
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///app.db
CELERY_BROKER_URL=redis://localhost:6379/0
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-password
```

## Dependencies

All dependencies are listed in `requirements.txt`. Key packages:

- Flask 3.0.0
- Flask-SQLAlchemy 3.1.1
- Flask-Login 0.6.3
- Celery 5.3.6
- Redis 5.0.1
- And more...

See `requirements.txt` for the complete list.

## Development

### Running Tests

```bash
# Verify dependencies
python verify_dependencies.py
```

### Database Migrations

```bash
flask db init
flask db migrate -m "Description"
flask db upgrade
```

## Troubleshooting

### Common Issues

- **ModuleNotFoundError**: Run `pip install -r requirements.txt`
- **Redis Connection Error**: Ensure Redis is running (`redis-server`)
- **Database Errors**: Delete `instance/app.db` and run `python init_db.py`
- **Windows greenlet build error**: Install greenlet separately: `pip install greenlet --only-binary :all:`
- **Python 3.13 compatibility errors**: Ensure SQLAlchemy>=2.0.25 and typing-extensions>=4.12.0 are installed