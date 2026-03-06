import { ref, onMounted, computed, onUnmounted } from 'vue';

export default {
    setup() {
        const drives = ref([]);
        const myApplications = ref([]);
        const profile = ref({});
        const message = ref('');
        const filterText = ref('');
        const exportTaskId = ref(null);
        const exportStatus = ref(null);
        const exportPollingInterval = ref(null);
        const availableBranches = ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'IT', 'Other'];
        const availableYears = [1, 2, 3, 4];

        const fetchProfile = async () => {
            const res = await fetch('/student/profile');
            if (res.ok) profile.value = await res.json();
        };

        const fetchDrives = async () => {
            const res = await fetch('/student/drives');
            if (res.ok) drives.value = await res.json();
        };

        const fetchApplications = async () => {
            const res = await fetch('/student/applications');
            if (res.ok) myApplications.value = await res.json();
        };

        const apply = async (driveId) => {
            const p = profile.value;
            const missing = [];
            if (!p.branch) missing.push("Branch");
            if (p.cgpa === null || p.cgpa === undefined || p.cgpa === '') missing.push("CGPA");
            if (!p.year_of_study) missing.push("Year of Study");

            if (missing.length > 0) {
                alert(`Please complete your profile before applying. Missing fields: ${missing.join(', ')}`);
                document.querySelector('button[data-bs-target="#profile"]').click();
                return;
            }

            const drive = drives.value.find(d => d.id === driveId);
            if (drive && !drive.is_eligible) {
                alert("You are not eligible for this drive. Please check the eligibility criteria.");
                return;
            }

            if (!confirm("Are you sure you want to apply?")) return;
            const res = await fetch(`/student/apply/${driveId}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                message.value = "Applied successfully!";
                fetchDrives();
                fetchApplications();
            } else {
                message.value = "Error: " + data.error;
            }
        };

        const viewOffer = async (appId) => {
            const res = await fetch(`/student/applications/${appId}/offer-letter`);
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

        const exportData = async () => {
            message.value = 'Queuing Export Task...';
            exportStatus.value = 'loading';

            try {
                const res = await fetch('/student/export', { method: 'POST' });
                const data = await res.json();

                if (res.ok && data.status === 'queued') {
                    message.value = data.message;
                    exportTaskId.value = data.task_id;

                    exportPollingInterval.value = setInterval(async () => {
                        try {
                            const statusRes = await fetch(`/student/export/status/${exportTaskId.value}`);
                            const statusData = await statusRes.json();

                            if (statusData.status === 'completed') {
                                clearInterval(exportPollingInterval.value);
                                exportStatus.value = 'success';
                                message.value = `Export completed! Download: ${statusData.result.filename}`;
                                setTimeout(() => {
                                    window.location.href = `/student/download-export/${statusData.result.filename}`;
                                }, 1000);
                            } else if (statusData.status === 'error') {
                                clearInterval(exportPollingInterval.value);
                                exportStatus.value = 'error';
                                message.value = `Export failed: ${statusData.error}`;
                            }
                        } catch (err) {
                            clearInterval(exportPollingInterval.value);
                            exportStatus.value = 'error';
                            message.value = "Error checking export status: " + err.message;
                        }
                    }, 2000);

                } else if (res.ok && data.status === 'success') {
                    exportStatus.value = 'success';
                    message.value = `Export completed! Download: ${data.filename}`;
                    setTimeout(() => {
                        window.location.href = `/student/download-export/${data.filename}`;
                    }, 1000);
                } else {
                    exportStatus.value = 'error';
                    message.value = data.message || data.error || "Failed to start export task";
                }
            } catch (err) {
                exportStatus.value = 'error';
                message.value = "Error starting export: " + err.message;
            }
        };

        const uploadResume = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
            const allowedExtensions = ['pdf', 'doc', 'docx'];
            const fileExtension = file.name.split('.').pop().toLowerCase();

            if (!allowedExtensions.includes(fileExtension)) {
                message.value = "Error: Invalid file type. Please upload PDF, DOC, or DOCX files.";
                event.target.value = '';
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                message.value = "Error: File size too large. Maximum size is 5MB.";
                event.target.value = '';
                return;
            }

            const formData = new FormData();
            formData.append('resume', file);

            try {
                const res = await fetch('/student/upload-resume', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                if (res.ok) {
                    message.value = "Resume uploaded successfully!";
                    profile.value.resume_url = data.resume_url;
                    await fetchProfile();
                } else {
                    message.value = "Error: " + (data.error || "Failed to upload resume");
                }
            } catch (error) {
                message.value = "Error: " + error.message;
            }
        };

        const updateProfile = async () => {
            const res = await fetch('/student/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profile.value)
            });
            if (res.ok) {
                message.value = "Profile updated! Open Drives have been refreshed with your new eligibility.";
                await fetchProfile();
                await fetchDrives();
            } else {
                const data = await res.json();
                message.value = "Error: " + (data.error || "Failed to update profile");
            }
        };

        onMounted(() => {
            fetchProfile();
            fetchDrives();
            fetchApplications();
        });

        onUnmounted(() => {
            if (exportPollingInterval.value) {
                clearInterval(exportPollingInterval.value);
            }
        });

        onMounted(() => {
            fetchProfile();
            fetchDrives();
            fetchApplications();
        });

        const filteredDrives = computed(() => {
            if (!filterText.value) return drives.value;
            const q = filterText.value.toLowerCase();
            return drives.value.filter(d =>
                d.job_title.toLowerCase().includes(q) ||
                d.company_name.toLowerCase().includes(q)
            );
        });

        const formatEligibility = (criteriaText) => {
            if (!criteriaText) return "None specified";
            try {
                const criteria = JSON.parse(criteriaText);
                let parts = [];
                if (criteria.min_year) {
                    const suffix = criteria.min_year === 1 ? 'st' : criteria.min_year === 2 ? 'nd' : criteria.min_year === 3 ? 'rd' : 'th';
                    parts.push(`Year >= ${criteria.min_year}${suffix}`);
                }
                if (criteria.min_cgpa) parts.push(`Min CGPA: ${criteria.min_cgpa}`);
                if (criteria.branches && criteria.branches.length) {
                    parts.push(`Branches: ${criteria.branches.join(', ')}`);
                }
                return parts.length > 0 ? parts.join(' | ') : "None specified";
            } catch (e) {
                return criteriaText;
            }
        };

        const formatDate = (dateString) => {
            if (!dateString) return '';
            return dateString.split('T')[0];
        };

        return {
            drives,
            myApplications,
            profile,
            apply,
            message,
            filterText,
            filteredDrives,
            exportData,
            updateProfile,
            viewOffer,
            uploadResume,
            exportStatus,
            exportTaskId,
            formatEligibility,
            formatDate,
            availableBranches,
            availableYears
        };
    },
    template: `
        <div>
            <h2>Student Dashboard</h2>
             <div v-if="message" class="alert alert-info alert-dismissible fade show">
                {{ message }}
                 <button type="button" class="btn-close" @click="message=''"></button>
            </div>

            <ul class="nav nav-tabs mb-4" id="myTab" role="tablist">
                <li class="nav-item">
                    <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#drives" type="button">Open Drives</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#apps" type="button">My Applications</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#profile" type="button">Profile</button>
                </li>
            </ul>

            <div class="tab-content">
                <div class="tab-pane fade show active" id="drives">
                    <div class="mb-3">
                         <input v-model="filterText" type="text" class="form-control" placeholder="Search by Company or Role...">
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3" v-for="drive in filteredDrives" :key="drive.id">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h5 class="card-title">{{ drive.job_title }}</h5>
                                    <h6 class="card-subtitle mb-2 text-muted">{{ drive.company_name }}</h6>
                                    <p class="card-text">{{ drive.job_description }}</p>
                                    <p class="card-text"><small class="text-muted">Eligibility: {{ formatEligibility(drive.eligibility_criteria) }}</small></p>
                                    <p class="card-text"><small class="text-muted">Deadline: {{ formatDate(drive.deadline) }}</small></p>
                                    <button v-if="!drive.is_applied && drive.is_eligible" class="btn btn-primary" @click="apply(drive.id)">Apply Now</button>
                                    <button v-else-if="!drive.is_applied && !drive.is_eligible" class="btn btn-outline-danger" @click="apply(drive.id)">Not Eligible</button>
                                    <button v-else class="btn btn-secondary" disabled>Applied</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tab-pane fade" id="apps">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div></div>
                        <button class="btn btn-secondary btn-sm" @click="exportData">
                            Export to CSV
                        </button>
                    </div>
                     <table class="table" v-if="myApplications.length">
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Interviews</th>
                                <th>Applied On</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="app in myApplications" :key="app.id">
                                <td>{{ app.company_name }}</td>
                                <td>{{ app.job_title }}</td>
                                <td>
                                    <span class="badge" :class="{
                                        'bg-warning': app.status === 'Applied',
                                        'bg-info': app.status === 'Shortlisted',
                                        'bg-success': app.status === 'Selected',
                                        'bg-danger': app.status === 'Rejected'
                                    }">{{ app.status }}</span>
                                    <button v-if="app.status === 'Selected'" class="btn btn-sm btn-outline-primary ms-2 d-block mt-2" @click="viewOffer(app.application_id)">View Offer</button>
                                </td>
                                <td>
                                    <div v-if="app.interviews && app.interviews.length > 0">
                                        <div v-for="interview in app.interviews" :key="interview.id" class="p-1 border bg-light small mb-1">
                                            <strong>{{ interview.interview_type }}</strong><br>
                                            Date: {{ new Date(interview.interview_date).toLocaleString() }}<br>
                                            Location: {{ interview.location }}
                                            <div v-if="interview.notes"><em>Notes: {{ interview.notes }}</em></div>
                                        </div>
                                    </div>
                                    <span v-else class="text-muted small">None scheduled</span>
                                </td>
                                <td>{{ formatDate(app.applied_on) }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else>No applications yet.</p>
                </div>

                <div class="tab-pane fade" id="profile">
                    <form @submit.prevent="updateProfile">
                         <div class="mb-3">
                            <label class="form-label">Branch <span class="text-danger">*</span></label>
                            <select v-model="profile.branch" class="form-select" required>
                                <option value="" disabled>Select your branch</option>
                                <option v-for="branch in availableBranches" :key="branch" :value="branch">
                                    {{ branch }}
                                </option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">CGPA <span class="text-danger">*</span></label>
                            <input v-model="profile.cgpa" type="number" step="0.01" class="form-control" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Year of Study <span class="text-danger">*</span></label>
                            <select v-model="profile.year_of_study" class="form-select" required>
                                <option value="" disabled>Select your year</option>
                                <option v-for="year in availableYears" :key="year" :value="year">
                                    {{ year }}{{ year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th' }} Year
                                </option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Resume</label>
                            <div class="input-group">
                                <input 
                                    type="file" 
                                    class="form-control" 
                                    accept=".pdf,.doc,.docx"
                                    @change="uploadResume"
                                    id="resume-upload"
                                >
                                <label class="input-group-text" for="resume-upload">
                                    <i class="bi bi-upload"></i> Upload
                                </label>
                            </div>
                            <small class="form-text text-muted">
                                Accepted formats: PDF, DOC, DOCX (Max 5MB)
                            </small>
                            <div v-if="profile.resume_url" class="mt-2">
                                <small class="text-success">
                                    Current resume: 
                                    <a :href="profile.resume_url" target="_blank" class="text-decoration-none">
                                        View/Download
                                    </a>
                                </small>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary">Save Profile</button>
                    </form>
                </div>
            </div>
        </div>
    `
};
