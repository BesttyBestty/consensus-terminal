import { createRouter, createWebHistory } from 'vue-router'
import Home from './Home.vue'
import Meeting from './Meeting.vue'
import Present from './Present.vue'
import Vote from './Vote.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/meeting/:id', component: Meeting },
    { path: '/present/:id', component: Present },
    { path: '/vote/:sid', component: Vote }
  ]
})
