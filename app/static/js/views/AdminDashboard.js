import { ref, onMounted, computed, watch } from 'vue';

export default {
    setup() {
        const stats = ref({ students: 0, companies: 0, drives: 0 });
        const detailedStats = ref(null);
        const pendingCompanies = ref([]);
        const pendingDrives = ref([]);
        const allCompanies = ref([]);
        const allStudents = ref([]);
        const allDrives = ref([]);
        const filteredCompanies = ref([]);
        const filteredStudents = ref([]);
        const message = ref('');
        const companySearch = ref('');
        const studentSearch = ref('');
        const companySearchTimeout = ref(null);
        const studentSearchTimeout = ref(null);
        const isSearchingCompanies = ref(false);
        const isSearchingStudents = ref(false);

        const searchCompanies = async (query) => {
            if (!query || query.trim() === '') {
                filteredCompanies.value = allCompanies.value;
                return;
            }

            isSearchingCompanies.value = true;
            try {
                const res = await fetch(`/admin/search/companies?q=${encodeURIComponent(query)}`);
                if (res.ok) {
                    filteredCompanies.value = await res.json();
                } else {
                    const q = query.toLowerCase();
                    filteredCompanies.value = allCompanies.value.filter(c =>
                        c.company_name.toLowerCase().includes(q) ||
                        c.email.toLowerCase().includes(q)
                    );
                }
            } catch (error) {
                console.error('Search error:', error);
                const q = query.toLowerCase();
                filteredCompanies.value = allCompanies.value.filter(c =>
                    c.company_name.toLowerCase().includes(q) ||
                    c.email.toLowerCase().includes(q)
                );
            } finally {
                isSearchingCompanies.value = false;
            }
        };

        const searchStudents = async (query) => {
            if (!query || query.trim() === '') {
                filteredStudents.value = allStudents.value;
                return;
            }

            isSearchingStudents.value = true;
            try {
                const res = await fetch(`/admin/search/students?q=${encodeURIComponent(query)}`);
                if (res.ok) {
                    filteredStudents.value = await res.json();
                } else {
                    const q = query.toLowerCase();
                    filteredStudents.value = allStudents.value.filter(s =>
                        s.name.toLowerCase().includes(q) ||
                        s.email.toLowerCase().includes(q) ||
                        (s.branch && s.branch.toLowerCase().includes(q))
                    );
                }
            } catch (error) {
                console.error('Search error:', error);
                const q = query.toLowerCase();
                filteredStudents.value = allStudents.value.filter(s =>
                    s.name.toLowerCase().includes(q) ||
                    s.email.toLowerCase().includes(q) ||
                    (s.branch && s.branch.toLowerCase().includes(q))
                );
            } finally {
                isSearchingStudents.value = false;
            }
        };

        watch(companySearch, (newValue) => {
            if (companySearchTimeout.value) {
                clearTimeout(companySearchTimeout.value);
            }
            companySearchTimeout.value = setTimeout(() => {
                searchCompanies(newValue);
            }, 300);
        });

        watch(studentSearch, (newValue) => {
            if (studentSearchTimeout.value) {
                clearTimeout(studentSearchTimeout.value);
            }
            studentSearchTimeout.value = setTimeout(() => {
                searchStudents(newValue);
            }, 300);
        });

        const fetchStats = async () => {
            const res = await fetch('/admin/stats');
            if (res.ok) {
                stats.value = await res.json();
            }

            const detailedRes = await fetch('/admin/reports/statistics');
            if (detailedRes.ok) {
                detailedStats.value = await detailedRes.json();
            }
        };

        const fetchPending = async () => {
            const cRes = await fetch('/admin/companies/pending');
            if (cRes.ok) pendingCompanies.value = await cRes.json();

            const dRes = await fetch('/admin/drives/pending');
            if (dRes.ok) pendingDrives.value = await dRes.json();
        };

        const fetchAllData = async () => {
            const cRes = await fetch('/admin/companies');
            if (cRes.ok) {
                allCompanies.value = await cRes.json();
                if (!companySearch.value || companySearch.value.trim() === '') {
                    filteredCompanies.value = allCompanies.value;
                }
            }

            const sRes = await fetch('/admin/students');
            if (sRes.ok) {
                allStudents.value = await sRes.json();
                if (!studentSearch.value || studentSearch.value.trim() === '') {
                    filteredStudents.value = allStudents.value;
                }
            }

            const dResAll = await fetch('/admin/drives');
            if (dResAll.ok) {
                allDrives.value = await dResAll.json();
            }
        };

        const availableBranches = ['CSE', 'ECE', 'EEE', 'ME', 'CE', 'IT', 'Other'];

        const editingDriveId = ref(null);
        const editDriveForm = ref({
            job_title: '',
            job_description: '',
            min_cgpa: null,
            branches: [],
            min_year: null,
            status: '',
            application_deadline: ''
        });

        const startEditDrive = (drive) => {
            editingDriveId.value = drive.id;

            let parsedCriteria = { min_cgpa: null, branches: [], min_year: null };
            if (drive.eligibility_criteria) {
                try {
                    let parsed = JSON.parse(drive.eligibility_criteria);
                    if (typeof parsed === 'object' && parsed !== null) {
                        parsedCriteria = parsed;
                    }
                } catch (e) {
                    console.error("Failed to parse eligibility criteria", e);
                }
            }

            editDriveForm.value = {
                job_title: drive.job_title || '',
                job_description: drive.job_description || '',
                min_cgpa: parsedCriteria.min_cgpa || null,
                branches: Array.isArray(parsedCriteria.branches) ? parsedCriteria.branches : [],
                min_year: parsedCriteria.min_year || null,
                status: drive.status || 'Pending',
                application_deadline: drive.application_deadline
                    ? new Date(drive.application_deadline).toISOString().slice(0, 10)
                    : ''
            };
        };

        const cancelEditDrive = () => {
            editingDriveId.value = null;
        };

        const saveDrive = async () => {
            let payload = { ...editDriveForm.value };
            if (payload.application_deadline) {
                payload.application_deadline = new Date(payload.application_deadline).toISOString();
            } else {
                payload.application_deadline = null;
            }
            payload.eligibility_criteria = JSON.stringify({
                min_cgpa: payload.min_cgpa,
                branches: payload.branches,
                min_year: payload.min_year
            });
            delete payload.min_cgpa;
            delete payload.branches;
            delete payload.min_year;

            const res = await fetch(`/admin/drives/${editingDriveId.value}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                message.value = "Drive updated successfully";
                editingDriveId.value = null;
                fetchAllData();
            } else {
                message.value = "Failed to update drive";
            }
        };

        const deleteDrive = async (id) => {
            if (!confirm("Are you sure you want to delete this drive?")) return;
            const res = await fetch(`/admin/drives/${id}`, { method: 'DELETE' });
            if (res.ok) {
                message.value = "Drive deleted successfully";
                fetchAllData();
                fetchPending();
                fetchStats();
            } else {
                message.value = "Failed to delete drive";
            }
        };

        const verifyCompany = async (id, action) => {
            const res = await fetch(`/admin/companies/${id}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            if (res.ok) {
                message.value = `Company ${action}ed`;
                fetchPending();
                fetchAllData();
            }
        };

        const verifyDrive = async (id, action) => {
            const res = await fetch(`/admin/drives/${id}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            if (res.ok) {
                message.value = `Drive ${action}ed`;
                fetchPending();
            }
        };

        const toggleBlacklist = async (id) => {
            if (!confirm("Are you sure?")) return;
            const res = await fetch(`/admin/companies/${id}/toggle_blacklist`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                message.value = data.message;
                fetchAllData();
            }
        };

        const toggleUserActive = async (userId) => {
            if (!confirm("Are you sure (Deactivate/Activate)?")) return;
            const res = await fetch(`/admin/users/${userId}/toggle_status`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                message.value = data.message;
                fetchAllData();
            }
        };

        onMounted(() => {
            fetchStats();
            fetchPending();
            fetchAllData();
        });

        return {
            stats,
            pendingCompanies,
            pendingDrives,
            allCompanies,
            allStudents,
            allDrives,
            verifyCompany,
            verifyDrive,
            message,
            companySearch,
            studentSearch,
            filteredCompanies,
            filteredStudents,
            toggleBlacklist,
            toggleUserActive,
            isSearchingCompanies,
            isSearchingStudents,
            editingDriveId,
            editDriveForm,
            startEditDrive,
            cancelEditDrive,
            saveDrive,
            deleteDrive,
            detailedStats,
            availableBranches
        };
    },
    template: `
        <div>
            <h2>Admin Dashboard</h2>
            <div v-if="message" class="alert alert-success alert-dismissible fade show">
                {{ message }}
                <button type="button" class="btn-close" @click="message=''"></button>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-4">
                     <div class="card text-white bg-primary mb-3">
                        <div class="card-body">
                            <h5 class="card-title">Students</h5>
                            <p class="card-text display-6">{{ stats.students }}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card text-white bg-success mb-3">
                        <div class="card-body">
                            <h5 class="card-title">Companies</h5>
                            <p class="card-text display-6">{{ stats.companies }}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card text-white bg-info mb-3">
                        <div class="card-body">
                            <h5 class="card-title">Drives</h5>
                            <p class="card-text display-6">{{ stats.drives }}</p>
                        </div>
                    </div>
                </div>
            </div>

            <ul class="nav nav-tabs mb-4" id="adminTab" role="tablist">
                <li class="nav-item">
                    <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#overview" type="button">Overview</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#companies" type="button">All Companies</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#students" type="button">All Students</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#drives" type="button">All Drives</button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" data-bs-toggle="tab" data-bs-target="#reports" type="button">Reports & Statistics</button>
                </li>
            </ul>

            <div class="tab-content">
                <div class="tab-pane fade show active" id="overview">
                    <h4>Pending Companies</h4>
                    <table class="table table-striped" v-if="pendingCompanies.length">
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Email</th>
                                <th>Website</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="c in pendingCompanies" :key="c.id">
                                <td>{{ c.company_name }}</td>
                                <td>{{ c.email }}</td>
                                <td>{{ c.website }}</td>
                                <td>
                                    <button class="btn btn-sm btn-success me-2" @click="verifyCompany(c.id, 'approve')">Approve</button>
                                    <button class="btn btn-sm btn-danger" @click="verifyCompany(c.id, 'reject')">Reject</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else>No pending company approvals.</p>

                    <h4 class="mt-4">Pending Drives</h4>
                    <table class="table table-striped" v-if="pendingDrives.length">
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Role</th>
                                <th>Deadline</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="d in pendingDrives" :key="d.id">
                                <td>{{ d.company_name }}</td>
                                <td>{{ d.job_title }}</td>
                                <td>{{ d.application_deadline ? new Date(d.application_deadline).toLocaleDateString() : 'N/A' }}</td>
                                <td>
                                    <button class="btn btn-sm btn-success me-2" @click="verifyDrive(d.id, 'approve')">Approve</button>
                                    <button class="btn btn-sm btn-danger" @click="verifyDrive(d.id, 'reject')">Reject</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else>No pending drive approvals.</p>
                </div>

                <div class="tab-pane fade" id="companies">
                    <h4>All Companies</h4>
                    <div class="mb-3">
                        <div class="input-group">
                            <input 
                                v-model="companySearch" 
                                type="text" 
                                class="form-control" 
                                placeholder="Search Companies (name, email, HR contact)..."
                            >
                            <span v-if="isSearchingCompanies" class="input-group-text">
                                <span class="spinner-border spinner-border-sm" role="status"></span>
                            </span>
                        </div>
                        <small class="text-muted">Searching via backend for better performance</small>
                    </div>
                     <table class="table table-striped" v-if="filteredCompanies.length">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="c in filteredCompanies" :key="c.id">
                                <td>{{ c.company_name }}</td>
                                <td>{{ c.email }}</td>
                                <td>
                                    <span class="badge" :class="{
                                        'bg-success': c.approval_status === 'Approved',
                                        'bg-warning': c.approval_status === 'Pending',
                                        'bg-danger': c.approval_status === 'Rejected'
                                    }">{{ c.approval_status }}</span>
                                    <span v-if="c.is_blacklisted" class="badge bg-dark ms-1">Blacklisted</span>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-outline-dark" @click="toggleBlacklist(c.id)">
                                        {{ c.is_blacklisted ? 'Whitelist' : 'Blacklist' }}
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else-if="!isSearchingCompanies && companySearch.trim() !== ''" class="text-muted">No companies found matching your search.</p>
                    <p v-else-if="!isSearchingCompanies && companySearch.trim() === ''">No companies found.</p>
                </div>

                <div class="tab-pane fade" id="students">
                    <h4>All Students</h4>
                    <div class="mb-3">
                        <div class="input-group">
                            <input 
                                v-model="studentSearch" 
                                type="text" 
                                class="form-control" 
                                placeholder="Search Students (name, email, branch)..."
                            >
                            <span v-if="isSearchingStudents" class="input-group-text">
                                <span class="spinner-border spinner-border-sm" role="status"></span>
                            </span>
                        </div>
                        <small class="text-muted">Searching via backend for better performance</small>
                    </div>
                     <table class="table table-striped" v-if="filteredStudents.length">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Branch</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in filteredStudents" :key="s.id">
                                <td>{{ s.name }}</td>
                                <td>{{ s.email }}</td>
                                <td>{{ s.branch }}</td>
                                <td>{{ s.status }}</td>
                                <td>
                                     <button class="btn btn-sm" :class="s.is_active ? 'btn-outline-danger' : 'btn-outline-success'" @click="toggleUserActive(s.user_id)">
                                        {{ s.is_active ? 'Deactivate' : 'Activate' }}
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else-if="!isSearchingStudents && studentSearch.trim() !== ''" class="text-muted">No students found matching your search.</p>
                    <p v-else-if="!isSearchingStudents && studentSearch.trim() === ''">No students found.</p>
                </div>

                <div class="tab-pane fade" id="drives">
                    <h4>All Placement Drives</h4>
                    <table class="table table-striped" v-if="allDrives.length">
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Deadline</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <template v-for="d in allDrives" :key="d.id">
                                <tr v-if="editingDriveId !== d.id">
                                    <td>{{ d.company_name }}</td>
                                    <td>{{ d.job_title }}</td>
                                    <td>
                                        <span class="badge" :class="{
                                            'bg-success': d.status === 'Approved',
                                            'bg-warning': d.status === 'Pending',
                                            'bg-secondary': d.status === 'Closed',
                                            'bg-danger': d.status === 'Rejected'
                                        }">{{ d.status }}</span>
                                    </td>
                                    <td>{{ d.application_deadline ? new Date(d.application_deadline).toLocaleDateString() : 'N/A' }}</td>
                                    <td>
                                        <button class="btn btn-sm btn-primary me-2" @click="startEditDrive(d)">Edit</button>
                                        <button class="btn btn-sm btn-danger" @click="deleteDrive(d.id)">Delete</button>
                                    </td>
                                </tr>
                                <tr v-else>
                                    <td colspan="5">
                                        <div class="card card-body">
                                            <h5>Edit Drive</h5>
                                            <div class="mb-2">
                                                <label>Job Title</label>
                                                <input type="text" class="form-control" v-model="editDriveForm.job_title">
                                            </div>
                                            <div class="mb-2">
                                                <label>Description</label>
                                                <textarea class="form-control" v-model="editDriveForm.job_description"></textarea>
                                            </div>
                                            <div class="row">
                                                <div class="col-md-6 mb-2">
                                                    <label>Minimum CGPA</label>
                                                    <input type="number" step="0.01" class="form-control" v-model="editDriveForm.min_cgpa">
                                                </div>
                                                <div class="col-md-6 mb-2">
                                                    <label>Min Year of Study</label>
                                                    <select class="form-select" v-model="editDriveForm.min_year">
                                                        <option :value="null">None</option>
                                                        <option :value="1">1st Year</option>
                                                        <option :value="2">2nd Year</option>
                                                        <option :value="3">3rd Year</option>
                                                        <option :value="4">4th Year</option>
                                                    </select>
                                                </div>
                                                <div class="col-md-12 mb-2">
                                                    <label class="d-block">Eligible Branches</label>
                                                    <div>
                                                        <div class="form-check form-check-inline me-3" v-for="branch in availableBranches" :key="branch">
                                                            <input class="form-check-input" type="checkbox" :id="'edit-cb-' + branch" :value="branch" v-model="editDriveForm.branches">
                                                            <label class="form-check-label" :for="'edit-cb-' + branch">{{ branch }}</label>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="mb-2">
                                                <label>Status</label>
                                                <select class="form-control" v-model="editDriveForm.status">
                                                    <option>Pending</option>
                                                    <option>Approved</option>
                                                    <option>Rejected</option>
                                                    <option>Closed</option>
                                                </select>
                                            </div>
                                            <div class="mb-3">
                                                <label>Deadline</label>
                                                <input type="date" class="form-control" v-model="editDriveForm.application_deadline">
                                            </div>
                                            <div>
                                                <button class="btn btn-sm btn-success me-2" @click="saveDrive">Save</button>
                                                <button class="btn btn-sm btn-secondary" @click="cancelEditDrive">Cancel</button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                    <p v-else>No placement drives found.</p>
                </div>

                <div class="tab-pane fade" id="reports">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h4>Platform Reports & Statistics</h4>
                        <button class="btn btn-outline-primary btn-sm" @click="fetchStats">
                            <i class="bi bi-arrow-clockwise"></i> Refresh Data
                        </button>
                    </div>

                    <div v-if="detailedStats">
                        <div class="row mb-4">
                            <!-- Students Stats -->
                            <div class="col-md-6 mb-3">
                                <div class="card h-100 shadow-sm">
                                    <div class="card-header bg-primary text-white">
                                        <h5 class="card-title mb-0">Student Placement Status</h5>
                                    </div>
                                    <div class="card-body d-flex flex-column justify-content-center">
                                        <div class="row text-center mb-3">
                                            <div class="col">
                                                <h3 class="text-success">{{ detailedStats.students.placed }}</h3>
                                                <span class="text-muted">Placed</span>
                                            </div>
                                            <div class="col border-start">
                                                <h3 class="text-warning">{{ detailedStats.students.unplaced }}</h3>
                                                <span class="text-muted">Unplaced</span>
                                            </div>
                                        </div>
                                        <div class="progress" style="height: 25px;">
                                            <div class="progress-bar bg-success" role="progressbar" 
                                                 :style="{width: (detailedStats.students.total > 0 ? (detailedStats.students.placed / detailedStats.students.total * 100) : 0) + '%'}"
                                                 :aria-valuenow="detailedStats.students.placed" aria-valuemin="0" :aria-valuemax="detailedStats.students.total">
                                                {{ detailedStats.students.total > 0 ? Math.round(detailedStats.students.placed / detailedStats.students.total * 100) : 0 }}%
                                            </div>
                                        </div>
                                        <p class="text-center mt-2 mb-0 fw-bold">Total Students: {{ detailedStats.students.total }}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Application Stats -->
                            <div class="col-md-6 mb-3">
                                <div class="card h-100 shadow-sm">
                                    <div class="card-header bg-info text-white">
                                        <h5 class="card-title mb-0">Application Funnel</h5>
                                    </div>
                                    <div class="card-body">
                                        <div class="d-flex justify-content-between mb-2 pb-2 border-bottom">
                                            <span>Total Applications:</span>
                                            <span class="badge bg-secondary rounded-pill">{{ detailedStats.applications.total }}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2 mt-3 text-secondary">
                                            <span>Just Applied:</span>
                                            <span class="fw-bold">{{ detailedStats.applications.applied }}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2 text-primary">
                                            <span>Shortlisted:</span>
                                            <span class="fw-bold">{{ detailedStats.applications.shortlisted }}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2 text-success">
                                            <span>Selected (Offers):</span>
                                            <span class="fw-bold">{{ detailedStats.applications.selected }}</span>
                                        </div>
                                        <div class="d-flex justify-content-between text-danger">
                                            <span>Rejected:</span>
                                            <span class="fw-bold">{{ detailedStats.applications.rejected }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <!-- Company Stats -->
                            <div class="col-md-6 mb-3">
                                <div class="card h-100 shadow-sm">
                                    <div class="card-header bg-success text-white">
                                        <h5 class="card-title mb-0">Company Overview</h5>
                                    </div>
                                    <div class="card-body">
                                        <div class="row text-center">
                                            <div class="col-6 mb-3">
                                                <h4 class="text-success">{{ detailedStats.companies.approved }}</h4>
                                                <div class="small text-muted">Approved Active</div>
                                            </div>
                                            <div class="col-6 mb-3">
                                                <h4 class="text-warning">{{ detailedStats.companies.pending }}</h4>
                                                <div class="small text-muted">Pending Verification</div>
                                            </div>
                                            <div class="col-6">
                                                <h4 class="text-secondary">{{ detailedStats.companies.total }}</h4>
                                                <div class="small text-muted">Total Registered</div>
                                            </div>
                                            <div class="col-6">
                                                <h4 class="text-danger">{{ detailedStats.companies.blacklisted }}</h4>
                                                <div class="small text-muted">Blacklisted</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Drive Stats -->
                            <div class="col-md-6 mb-3">
                                <div class="card h-100 shadow-sm border-0 bg-light">
                                    <div class="card-body d-flex flex-column justify-content-center">
                                        <h5 class="text-center text-muted mb-4 border-bottom pb-2">Placement Drives Summary</h5>
                                        <div class="d-flex justify-content-around text-center">
                                            <div>
                                                <div class="display-6 text-primary">{{ detailedStats.drives.total }}</div>
                                                <div class="text-muted small">Total Drives</div>
                                            </div>
                                            <div>
                                                <div class="display-6 text-success">{{ detailedStats.drives.approved }}</div>
                                                <div class="text-muted small">Active/Approved</div>
                                            </div>
                                            <div>
                                                <div class="display-6 text-warning">{{ detailedStats.drives.pending }}</div>
                                                <div class="text-muted small">Pending Approval</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="text-center py-5">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p class="mt-2 text-muted">Loading detailed statistics...</p>
                    </div>
                </div>

            </div>
        </div>
    `
};
