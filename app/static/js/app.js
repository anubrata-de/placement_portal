import { createApp } from 'vue';
import router from './router.js';
import { store } from './store.js';

const App = {
    setup() {
        const logout = async () => {
            await fetch('/auth/logout', { method: 'POST' });
            store.logout();
            router.push('/login');
        };
        return { store, logout };
    },
    template: `
        <div>
            <nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-4" v-if="store.isAuthenticated">
                <div class="container">
                    <a class="navbar-brand" href="#">Placement Portal</a>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="navbarNav">
                        <ul class="navbar-nav ms-auto">
                            <li class="nav-item">
                                <span class="nav-link text-light">Welcome, {{ store.user ? store.user.username : '' }}</span>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="#" @click.prevent="logout">Logout</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
            <div class="container">
                <router-view></router-view>
            </div>
        </div>
    `
};

const app = createApp(App);
app.use(router);
app.mount('#app');
