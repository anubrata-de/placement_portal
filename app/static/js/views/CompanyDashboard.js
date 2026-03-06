import { ref, onMounted } from 'vue';

export default {
    setup() {
        const drives = ref([]);
        const profile = ref({});
        const applications = ref({});
        const newDrive = ref({ job_title: '', job_description: '', min_cgpa: null, branches: [], min_year: null, application_deadline: '' });
        const message = ref('');
        const showApps = ref(null);
        const availableBranches = ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'IT', 'Other'];

        const schedulingAppId = ref(null);
        const interviewForm = ref({
            interview_date: '',
            interview_type: 'Technical',
            location: '',
            notes: '',
            currentDriveId: null
        });

        const fetchDrives = async () => {
            const res = await fetch('/company/drives');
            if (res.ok) drives.value = await res.json();
            if (res.ok) drives.value = await res.json();
            else if (res.status === 403) {
                if (profile.value && profile.value.approval_status === 'Rejected') {
                    message.value = "Your profile has been rejected. Please contact support.";
                } else {
                    message.value = "Your profile is pending approval or rejected.";
                }
            }
        };

        const fetchProfile = async () => {
            const res = await fetch('/company/profile');
            if (res.ok) profile.value = await res.json();
        };

        const createDrive = async () => {
            if (!newDrive.value.job_title || !newDrive.value.application_deadline) {
                message.value = "Error: Job Title and Deadline are required.";
                return;
            }
            if (newDrive.value.branches.length === 0) {
                message.value = "Error: Please select at least one eligible branch.";
                return;
            }
            if (!newDrive.value.min_cgpa || !newDrive.value.min_year) {
                message.value = "Error: Minimum CGPA and Year of Study are required.";
                return;
            }

            const payload = {
                job_title: newDrive.value.job_title,
                job_description: newDrive.value.job_description,
                eligibility_criteria: JSON.stringify({
                    min_cgpa: newDrive.value.min_cgpa,
                    branches: newDrive.value.branches,
                    min_year: newDrive.value.min_year
                }),
                application_deadline: newDrive.value.application_deadline
            };
            const res = await fetch('/company/drives', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                message.value = "Drive posted successfully. Awaiting approval.";
                newDrive.value = { job_title: '', job_description: '', min_cgpa: null, branches: [], min_year: null, application_deadline: '' };
                fetchDrives();
            } else {
                const data = await res.json();
                message.value = "Error: " + data.error;
            }
        };

        const fetchApplications = async (driveId) => {
            if (showApps.value === driveId) {
                showApps.value = null;
                return;
            }
            const res = await fetch(`/company/drives/${driveId}/applications`);
            if (res.ok) {
                applications.value[driveId] = await res.json();
                showApps.value = driveId;
            }
        };

        const updateStatus = async (appId, status, driveId) => {
            const res = await fetch(`/company/applications/${appId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (res.ok) {
                const resApps = await fetch(`/company/drives/${driveId}/applications`);
                if (resApps.ok) applications.value[driveId] = await resApps.json();
            }
        };

        const startSchedule = (appId, driveId) => {
            schedulingAppId.value = appId;
            interviewForm.value = {
                interview_date: '',
                interview_type: 'Technical',
                location: '',
                notes: '',
                currentDriveId: driveId
            };
        };

        const cancelSchedule = () => {
            schedulingAppId.value = null;
        };

        const submitSchedule = async (appId) => {
            if (!interviewForm.value.interview_date) {
                alert("Please select an interview date and time.");
                return;
            }

            const isoDate = new Date(interviewForm.value.interview_date).toISOString();

            const payload = {
                interview_date: isoDate,
                interview_type: interviewForm.value.interview_type,
                location: interviewForm.value.location,
                notes: interviewForm.value.notes
            };

            const res = await fetch(`/company/applications/${appId}/schedule-interview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert("Interview scheduled successfully!");
                schedulingAppId.value = null;
                const driveId = interviewForm.value.currentDriveId;
                const resApps = await fetch(`/company/drives/${driveId}/applications`);
                if (resApps.ok) applications.value[driveId] = await resApps.json();
            } else {
                const data = await res.json();
                alert("Failed to schedule interview: " + (data.error || 'Unknown error'));
            }
        };

        const generateOffer = async (appId) => {
            const res = await fetch(`/company/applications/${appId}/offer-letter`, {
                method: 'POST'
            });
            if (res.ok) {
                const data = await res.json();
                const newWindow = window.open('', '_blank');
                newWindow.document.write(data.offer_letter);
                newWindow.document.close();
            } else {
                const data = await res.json();
                alert("Error: " + data.error);
            }
        };

        onMounted(() => {
            fetchProfile();
            fetchDrives();
        });

        const formatDate = (dateString) => {
            if (!dateString) return '';
            return dateString.split('T')[0];
        };

        return {
            drives, profile, newDrive, createDrive, message, fetchApplications, applications, showApps,
            updateStatus, generateOffer, availableBranches, formatDate,
            schedulingAppId, interviewForm, startSchedule, cancelSchedule, submitSchedule
        };
    },
    template: `
        <div>
            <h2>Company Dashboard</h2>
            <div class="alert" :class="{
                'alert-success': profile.approval_status === 'Approved',
                'alert-warning': profile.approval_status === 'Pending',
                'alert-danger': profile.approval_status === 'Rejected'
            }">
                Status: {{ profile.approval_status }}
            </div>
             <div v-if="message" class="alert alert-info alert-dismissible fade show">
                {{ message }}
                 <button type="button" class="btn-close" @click="message=''"></button>
            </div>

            <div v-if="profile.approval_status === 'Approved'">
                <div class="card">
                    <div class="card-header bg-primary text-white">Post New Drive</div>
                    <div class="card-body">
                        <form @submit.prevent="createDrive" class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label">Job Title <span class="text-danger">*</span></label>
                                <input v-model="newDrive.job_title" type="text" class="form-control" required>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Deadline <span class="text-danger">*</span></label>
                                <input v-model="newDrive.application_deadline" type="date" class="form-control" required>
                            </div>
                             <div class="col-12">
                                <label class="form-label">Description</label>
                                <textarea v-model="newDrive.job_description" class="form-control"></textarea>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">Minimum CGPA <span class="text-danger">*</span></label>
                                <input v-model="newDrive.min_cgpa" type="number" step="0.01" class="form-control" placeholder="e.g. 7.5" required>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">Min Year of Study <span class="text-danger">*</span></label>
                                <select v-model="newDrive.min_year" class="form-select" required>
                                    <option value="null" disabled>Select year</option>
                                    <option :value="1">1st Year</option>
                                    <option :value="2">2nd Year</option>
                                    <option :value="3">3rd Year</option>
                                    <option :value="4">4th Year</option>
                                </select>
                            </div>
                            <div class="col-md-12">
                                <label class="form-label d-block">Eligible Branches <span class="text-danger">*</span> (Select at least one)</label>
                                <div>
                                    <div class="form-check form-check-inline me-3" v-for="branch in availableBranches" :key="branch">
                                        <input class="form-check-input" type="checkbox" :id="'cb-' + branch" :value="branch" v-model="newDrive.branches">
                                        <label class="form-check-label" :for="'cb-' + branch">{{ branch }}</label>
                                    </div>
                                </div>
                            </div>
                            <div class="col-12">
                                <button type="submit" class="btn btn-primary">Create Drive</button>
                            </div>
                        </form>
                    </div>
                </div>

                <h4 class="mt-4">My Drives</h4>
                <div v-for="drive in drives" :key="drive.id" class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h5 class="card-title">{{ drive.job_title }}</h5>
                                <span class="badge" :class="drive.status === 'Approved' ? 'bg-success' : 'bg-secondary'">{{ drive.status }}</span>
                                <small class="text-muted ms-2">Deadline: {{ formatDate(drive.deadline) }}</small>
                            </div>
                            <button class="btn btn-outline-primary" @click="fetchApplications(drive.id)">
                                {{ showApps === drive.id ? 'Hide' : 'View' }} Applications ({{ drive.application_count }})
                            </button>
                        </div>
                        
                        <!-- Applications List -->
                        <div v-if="showApps === drive.id" class="mt-3">
                            <table class="table table-sm" v-if="applications[drive.id] && applications[drive.id].length">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Branch</th>
                                        <th>CGPA</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="app in applications[drive.id]" :key="app.application_id">
                                        <td>{{ app.student_name }}</td>
                                        <td>{{ app.branch }}</td>
                                        <td>{{ app.cgpa }}</td>
                                        <td>{{ app.status }}</td>
                                        <td>
                                            <div v-if="schedulingAppId !== app.application_id">
                                                <!-- If there are interviews scheduled, show them here -->
                                                <div v-if="app.interviews && app.interviews.length > 0" class="mb-2">
                                                    <div v-for="interview in app.interviews" :key="interview.id" class="p-1 border bg-light small mb-1">
                                                        <strong>{{ interview.interview_type }} Interview</strong><br>
                                                        Date: {{ new Date(interview.interview_date).toLocaleString() }}<br>
                                                        Location: {{ interview.location }}<br>
                                                        <em v-if="interview.notes">Notes: {{ interview.notes }}</em>
                                                    </div>
                                                </div>

                                                <div class="btn-group btn-group-sm">
                                                    <button v-if="app.status === 'Applied'" class="btn btn-info" @click="updateStatus(app.application_id, 'Shortlisted', drive.id)">Shortlist</button>
                                                    <button v-if="app.status === 'Shortlisted'" class="btn btn-primary" @click="startSchedule(app.application_id, drive.id)">Schedule Interview</button>
                                                    <button v-if="app.status === 'Shortlisted' && app.interviews && app.interviews.length > 0" class="btn btn-success" @click="updateStatus(app.application_id, 'Selected', drive.id)">Select</button>
                                                    <button v-if="app.status === 'Applied' || app.status === 'Shortlisted'" class="btn btn-danger" @click="updateStatus(app.application_id, 'Rejected', drive.id)">Reject</button>
                                                </div>
                                                <button v-if="app.status === 'Selected'" class="btn btn-sm btn-outline-warning mt-1" @click="generateOffer(app.application_id)">Offer Letter</button>
                                            </div>
                                            <!-- Schedule Interview Form Inline -->
                                            <div v-else class="card p-2 shadow-sm" style="min-width: 250px; z-index: 10;">
                                                <h6>Schedule Interview</h6>
                                                <div class="mb-2">
                                                    <label class="form-label mb-0 small">Date & Time *</label>
                                                    <input type="datetime-local" class="form-control form-control-sm" v-model="interviewForm.interview_date">
                                                </div>
                                                <div class="mb-2">
                                                    <label class="form-label mb-0 small">Type</label>
                                                    <select class="form-select form-select-sm" v-model="interviewForm.interview_type">
                                                        <option value="Technical">Technical</option>
                                                        <option value="HR">HR</option>
                                                        <option value="Final">Final</option>
                                                        <option value="Online Test">Online Test</option>
                                                    </select>
                                                </div>
                                                <div class="mb-2">
                                                    <label class="form-label mb-0 small">Location/Link</label>
                                                    <input type="text" class="form-control form-control-sm" v-model="interviewForm.location" placeholder="e.g. Google Meet link or Room 101">
                                                </div>
                                                <div class="mb-2">
                                                    <label class="form-label mb-0 small">Notes</label>
                                                    <textarea class="form-control form-control-sm" v-model="interviewForm.notes" rows="2" placeholder="Instructions..."></textarea>
                                                </div>
                                                <div>
                                                    <button class="btn btn-sm btn-success me-1" @click="submitSchedule(app.application_id)">Save</button>
                                                    <button class="btn btn-sm btn-secondary" @click="cancelSchedule">Cancel</button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            <p v-else class="text-muted text-center mt-2">No applications yet.</p>
                        </div>
                    </div>
                </div>
            </div>
            <div v-else>
                <p>Please wait for admin approval to post drives.</p>
            </div>
        </div>
    `
};
