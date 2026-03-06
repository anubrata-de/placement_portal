import { ref } from 'vue';
import { useRouter } from 'vue-router';

export default {
    setup() {
        const username = ref('');
        const email = ref('');
        const password = ref('');
        const role = ref('STUDENT');
        const companyName = ref('');
        const error = ref('');
        const router = useRouter();

        const register = async () => {
            try {
                const payload = {
                    username: username.value,
                    email: email.value,
                    password: password.value,
                    role: role.value
                };
                if (role.value === 'COMPANY') {
                    payload.company_name = companyName.value || username.value;
                }

                const res = await fetch('/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (res.ok) {
                    router.push('/login');
                } else {
                    error.value = data.error;
                }
            } catch (e) {
                error.value = 'Registration failed';
            }
        };

        return { username, email, password, role, companyName, register, error };
    },
    template: `
        <div class="row justify-content-center">
            <div class="col-md-6 col-lg-5">
                <div class="card mt-5">
                    <div class="card-body">
                        <h3 class="card-title text-center mb-4">Register</h3>
                        <div v-if="error" class="alert alert-danger">{{ error }}</div>
                        <form @submit.prevent="register">
                            <div class="mb-3">
                                <label class="form-label">Role</label>
                                <select v-model="role" class="form-select">
                                    <option value="STUDENT">Student</option>
                                    <option value="COMPANY">Company</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Username</label>
                                <input v-model="username" type="text" class="form-control" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <input v-model="email" type="email" class="form-control" required>
                            </div>
                            <div class="mb-3" v-if="role === 'COMPANY'">
                                <label class="form-label">Company Name</label>
                                <input v-model="companyName" type="text" class="form-control" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Password</label>
                                <input v-model="password" type="password" class="form-control" required>
                            </div>
                            <div class="d-grid gap-2">
                                <button type="submit" class="btn btn-success">Register</button>
                            </div>
                            <div class="mt-3 text-center">
                                <router-link to="/login">Already have an account? Login</router-link>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `
};
