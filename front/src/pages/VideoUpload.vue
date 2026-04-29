<template>
  <div class="flex flex-row h-screen w-screen bg-[#0a0a0c] text-slate-200 overflow-hidden font-sans">
    
    <aside class="w-64 flex-none bg-[#121214] border-r border-white/5 flex flex-col h-full">
      <div class="p-5 border-b border-white/5 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h2 class="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">视频库</h2>
          <label class="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-3 py-1.5 rounded-full transition-all">
            视频上传
            <input type="file" class="hidden" accept="video/*" @change="handleFileUpload" :disabled="isUploading" />
          </label>
        </div>
        
        <div v-if="isUploading" class="space-y-1">
          <div class="flex justify-between text-[9px] text-slate-500">
            <span>正在解析视频...</span>
            <span>{{ uploadPercent }}%</span>
          </div>
          <div class="h-1 bg-white/5 rounded-full overflow-hidden">
            <div class="h-full bg-blue-500 transition-all duration-300" :style="{ width: uploadPercent + '%' }"></div>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div 
          v-for="vid in sortedVideoList" :key="vid.id" @click="switchVideo(vid)"
          :class="['group cursor-pointer rounded-xl border-2 p-2 transition-all', 
                   currentVideo.id === vid.id ? 'border-blue-600 bg-blue-600/5' : 'border-transparent hover:bg-white/5']"
        >
          <div class="aspect-video bg-slate-800 rounded-lg overflow-hidden relative">
            <div class="w-full h-full flex items-center justify-center text-slate-600 bg-slate-900">
              <span class="text-xl">🎬</span>
            </div>
            <div v-if="vid.isNew" class="absolute top-1 left-1 bg-blue-600 text-[8px] px-1.5 py-0.5 rounded shadow-lg animate-pulse">NEW</div>
          </div>
          <p class="text-[11px] mt-2 truncate font-medium text-slate-400 group-hover:text-white">{{ vid.name }}</p>
        </div>
      </div>
    </aside>

    <main class="flex-1 flex flex-col bg-black relative">
      <div class="flex-1 relative flex items-center justify-center">
        <video 
          ref="videoPlayer" 
          class="w-full h-full object-contain"
          @timeupdate="onTimeUpdate"
          @loadedmetadata="onVideoLoaded"
          :src="currentVideo.url"
        ></video>

        <div class="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
          
          <div class="flex h-1.5 w-full gap-[2px] items-end mb-3">
            <div 
              v-for="seg in fullTimelineSegments" :key="seg.id"
              @click="!seg.isGap && seekTo(seg.start)"
              class="h-full relative transition-all duration-300 rounded-sm overflow-hidden"
              :class="[seg.isGap ? 'cursor-default' : 'cursor-pointer hover:h-2.5']"
              :style="{ width: ((seg.end - seg.start) / totalDuration * 100) + '%' }"
            >
              <div 
                class="absolute inset-0 transition-all duration-500"
                :style="{ backgroundColor: seg.color }"
                :class="[
                  seg.isGap ? 'opacity-20' : (currentTime < seg.start ? 'grayscale-[100%] opacity-20' : 'grayscale-0 opacity-100 shadow-[0_0_8px_rgba(59,130,246,0.5)]')
                ]"
              ></div>

              <div 
                v-if="!seg.isGap && currentTime >= seg.start && currentTime <= seg.end"
                class="absolute inset-y-0 left-0 bg-white/40"
                :style="{ width: ((currentTime - seg.start) / (seg.end - seg.start) * 100) + '%' }"
              ></div>
            </div>
          </div>

          <div class="flex justify-between items-center text-[11px] font-mono text-slate-400">
            <div class="flex items-center space-x-4">
              <button @click="togglePlay" class="text-white hover:text-blue-500 transition-colors text-lg">
                {{ isPlaying ? '⏸' : '▶' }}
              </button>
              <span class="text-slate-200">{{ formatTime(currentTime) }} / {{ formatTime(totalDuration) }}</span>
            </div>
            <div class="flex items-center space-x-3 text-[9px] uppercase tracking-widest opacity-60">
              <span>Time-R1 Analysis Mode</span>
            </div>
          </div>
        </div>
      </div>
    </main>

    <aside class="w-96 flex-none bg-[#121214] border-l border-white/5 flex flex-col h-full">
      <div class="p-5 border-b border-white/5 flex justify-between items-center">
        <h2 class="text-sm font-bold tracking-tight">Structured Analysis</h2>
        <span class="text-[9px] text-slate-500">动作片段: {{ currentSteps.length }}</span>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <div 
          v-for="step in currentSteps" :key="step.id" @click="seekTo(step.start)"
          :class="['p-4 rounded-xl border-l-[4px] transition-all cursor-pointer group', 
                   activeStepId === step.id ? 'bg-white/[0.04] shadow-xl' : 'bg-white/[0.01] opacity-60 hover:opacity-100']"
          :style="{ borderColor: activeStepId === step.id ? step.color : 'transparent' }"
        >
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] font-black uppercase tracking-widest" :style="{ color: step.color }">
              Step 0{{ step.id }}
            </span>
            <span class="text-[10px] font-mono opacity-40">{{ formatTime(step.start) }} - {{ formatTime(step.end) }}</span>
          </div>
          <p class="text-[13px] font-bold leading-relaxed mb-3">{{ step.desc }}</p>
          <div v-if="activeStepId === step.id && step.think" class="mt-3 pt-3 border-t border-white/5 animate-in fade-in">
            <span class="text-[9px] font-mono opacity-50" :style="{ color: step.color }">&lt;think&gt;</span>
            <p class="text-[11px] text-slate-400 italic mt-1 leading-relaxed">{{ step.think }}</p>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { uploadVideo } from '../api/upload' //
import { getVideoList } from '../api/videos' //

// --- 状态定义 ---
const videoList = ref<any[]>([])
const currentVideo = ref<any>({ id: 'init', name: '请上传视频', url: '' })
const isUploading = ref(false)
const uploadPercent = ref(0)
const videoPlayer = ref<HTMLVideoElement | null>(null)
const currentTime = ref(0)
const totalDuration = ref(0.1) // 避免除以0
const activeStepId = ref(1)
const isPlaying = ref(false)

const STEP_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']

// 由 uploadVideo 返回的 events + 当前视频总时长 生成动作步骤（无时间戳时均分时间轴）
const currentSteps = computed(() => {
  const events = currentVideo.value?.events || []
  const duration = totalDuration.value
  if (!events.length || duration <= 0) return []

  return events.map((e: any, i: number) => {
    return {
      id: i + 1,
      start: e.start || 0,
      end: e.end || 0,
      color: STEP_COLORS[i % STEP_COLORS.length],
      desc: e.action || '',
      think: ''
    }
  })
})

// --- 1. 核心逻辑：自动填充灰色间隙以对齐视频总长度 ---
const fullTimelineSegments = computed(() => {
  const result = [];
  let lastEnd = 0;
  const steps = currentSteps.value;

  steps.forEach((step: { id: number; start: number; end: number; [k: string]: unknown }, index: number) => {
    // 检查是否有前置间隙
    if (step.start > lastEnd) {
      result.push({
        id: `gap-${index}`,
        start: lastEnd,
        end: step.start,
        isGap: true,
        color: '#333333'
      });
    }
    // 添加实际动作段
    result.push({ ...step, isGap: false });
    lastEnd = step.end;
  });

  // 检查是否有末尾间隙
  if (lastEnd < totalDuration.value) {
    result.push({
      id: `gap-end`,
      start: lastEnd,
      end: totalDuration.value,
      isGap: true,
      color: '#333333'
    });
  }
  return result;
});

// --- 2. 列表排序逻辑 ---
const sortedVideoList = computed(() => {
  return [...videoList.value].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
});

// --- 3. 初始化与上传 ---
onMounted(async () => {
  try {
    const list = await getVideoList()
    videoList.value = list.map(v => ({ ...v, timestamp: Date.now() - 50000 }))
    if (list.length > 0) switchVideo(videoList.value[0])
  } catch (err) { console.error('获取列表失败') }
})

const handleFileUpload = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  isUploading.value = true
  uploadPercent.value = 0

  try {
    const res = await uploadVideo(file, {
      onProgress: (p) => { uploadPercent.value = p }
    })
    const newVid = {
      id: (res.url ? decodeURIComponent(res.url.split('/').pop() || '') : '') || String(Date.now()),
      name: file.name,
      url: res.url || URL.createObjectURL(file),
      timestamp: Date.now(),
      isNew: true,
      events: res.events ?? []
    }
    videoList.value.unshift(newVid)
    switchVideo(newVid)
  } catch (err) { alert('上传失败') } finally {
    isUploading.value = false
    input.value = ''
  }
}

// --- 4. 视频切换（动作数据来自 currentVideo.events，由 currentSteps 计算属性生成）---
const switchVideo = (vid: any) => {
  currentVideo.value = vid
}

// --- 5. 播放器基础交互 ---
const onVideoLoaded = () => {
  if (videoPlayer.value) totalDuration.value = videoPlayer.value.duration
}

const onTimeUpdate = () => {
  if (videoPlayer.value) {
    currentTime.value = videoPlayer.value.currentTime
    const found = currentSteps.value.find((s: { start: number; end: number }) => currentTime.value >= s.start && currentTime.value <= s.end)
    if (found) activeStepId.value = found.id
  }
}

const seekTo = (time: number) => {
  if (videoPlayer.value) {
    videoPlayer.value.currentTime = time
    videoPlayer.value.play()
    isPlaying.value = true
  }
}

const togglePlay = () => {
  if (!videoPlayer.value) return
  videoPlayer.value.paused ? videoPlayer.value.play() : videoPlayer.value.pause()
  isPlaying.value = !videoPlayer.value.paused
}

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }
.animate-in { animation: fade-in 0.3s ease-out forwards; }
@keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
</style>