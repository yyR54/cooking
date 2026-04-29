import { createRouter, createWebHashHistory } from 'vue-router'
import VideoUpload from '../pages/VideoUpload.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/upload/video' },
    { path: '/upload/video', component: VideoUpload },
  ],
})

export default router

