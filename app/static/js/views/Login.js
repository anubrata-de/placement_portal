import { ref } from 'vue';
import { store } from '../store.js';
import { useRouter } from 'vue-router';

export default {
    setup() {
        const username = ref('');
        const password = ref('');
        const error = ref('');
        const router = useRouter();

        const login = async () => {
            try {
                const res = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username.value, password: password.value })
                });
                const data = await res.json();

                if (res.ok) {
                    store.login(data.user);
                    if (data.user.role === 'ADMIN') router.push('/admin');
                    else if (data.user.role === 'COMPANY') router.push('/company');
                    else if (data.user.role === 'STUDENT') router.push('/student');
                } else {
                    error.value = data.error;
                }
            } catch (e) {
                error.value = 'Login failed';
            }
        };

        return { username, password, login, error };
    },
    template: `
        <div class="row justify-content-center">
            <div class="col-md-6 col-lg-4">
                <div class="card mt-5">
                    <div class="card-body">
                        <h3 class="card-title text-center mb-4">Login</h3>
                        <div v-if="error" class="alert alert-danger">{{ error }}</div>
                        <form @submit.prevent="login">
                            <div class="mb-3">
                                <label class="form-label">Username</label>
                                <input v-model="username" type="text" class="form-control" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Password</label>
                                <input v-model="password" type="password" class="form-control" required>
                            </div>
                            <div class="d-grid gap-2">
                                <button type="submit" class="btn btn-primary">Login</button>
                            </div>
                            <div class="mt-3 text-center">
                                <router-link to="/register">Don't have an account? Register</router-link>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `
};
