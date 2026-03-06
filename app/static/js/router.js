import { createRouter, createWebHashHistory } from 'vue-router';
import { store } from './store.js';

const Login = () => import('./views/Login.js');
const Register = () => import('./views/Register.js');
const AdminDashboard = () => import('./views/AdminDashboard.js');
const CompanyDashboard = () => import('./views/CompanyDashboard.js');
const StudentDashboard = () => import('./views/StudentDashboard.js');
const Home = { template: '<div>Loading...</div>' };

const routes = [
    {
        path: '/',
        component: Home,
        beforeEnter: (to, from, next) => {
            if (store.isAuthenticated) {
                if (store.user.role === 'ADMIN') next('/admin');
                else if (store.user.role === 'COMPANY') next('/company');
                else if (store.user.role === 'STUDENT') next('/student');
                else next('/login');
            } else {
                next('/login');
            }
        }
    },
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    {
        path: '/admin',
        component: AdminDashboard,
        meta: { requiresAuth: true, role: 'ADMIN' }
    },
    {
        path: '/company',
        component: CompanyDashboard,
        meta: { requiresAuth: true, role: 'COMPANY' }
    },
    {
        path: '/student',
        component: StudentDashboard,
        meta: { requiresAuth: true, role: 'STUDENT' }
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

router.beforeEach(async (to, from, next) => {
    if (store.user === null && !store.isAuthenticated) {
        await store.fetchUser();
    }

    if (to.meta.requiresAuth) {
        if (!store.isAuthenticated) {
            next('/login');
        } else if (to.meta.role && store.user.role !== to.meta.role) {
            next('/');
        } else {
            next();
        }
    } else {
        next();
    }
});

export default router;
