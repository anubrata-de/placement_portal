import { reactive } from 'vue';

export const store = reactive({
    user: null,
    isAuthenticated: false,
    async fetchUser() {
        try {
            const res = await fetch('/auth/status');
            const data = await res.json();
            if (data.is_authenticated) {
                this.user = data.user;
                this.isAuthenticated = true;
            } else {
                this.user = null;
                this.isAuthenticated = false;
            }
        } catch (e) {
            console.error('Auth check failed:', e);
            this.user = null;
            this.isAuthenticated = false;
        }
    },
    login(user) {
        this.user = user;
        this.isAuthenticated = true;
    },
    logout() {
        this.user = null;
        this.isAuthenticated = false;
    }
});
