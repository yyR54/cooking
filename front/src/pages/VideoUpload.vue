<template>
  <div class="flex flex-row h-screen w-screen bg-[#0a0a0c] text-slate-200 overflow-hidden font-sans">
    
    <aside class="w-64 flex-none bg-[#121214] border-r border-white/5 flex flex-col h-full">
      <div class="p-5 border-b border-white/5 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <h2 class="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">视频库</h2>
          <button
            type="button"
            class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none text-white text-[10px] px-3 py-1.5 rounded-full transition-all"
            :disabled="isUploading"
            @click="uploadPanelOpen = true"
          >
            视频上传
          </button>
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
          <div class="mt-2 flex items-center justify-between gap-2">
            <p class="text-[11px] min-w-0 truncate font-medium text-slate-400 group-hover:text-white">{{ vid.name }}</p>
            <button
              type="button"
              class="shrink-0 rounded-md px-2 py-1 text-[10px] text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              :disabled="deletingId === vid.id"
              @click.stop="handleDeleteVideo(vid)"
            >
              {{ deletingId === vid.id ? '删除中' : '删除' }}
            </button>
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              class="rounded px-1 py-0.5 text-[8px] font-mono border transition-colors"
              :class="
                currentVideo.id === vid.id && displayPipeline === 'stack'
                  ? 'border-blue-400/60 bg-blue-500/20 text-blue-100'
                  : 'border-blue-500/25 bg-blue-500/10 text-blue-300/80'
              "
              title="GLM + time-r1 动作段数"
            >
              R1 {{ pipelineSegCount(vid, 'stack') }}
            </span>
            <span
              class="rounded px-1 py-0.5 text-[8px] font-mono border transition-colors"
              :class="
                currentVideo.id === vid.id && displayPipeline === 'glm_only'
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                  : 'border-amber-500/25 bg-amber-500/10 text-amber-200/80'
              "
              title="GLM 动作段数"
            >
              GLM {{ pipelineSegCount(vid, 'glm_only') }}
            </span>
          </div>
        </div>
      </div>
    </aside>

    <main class="flex-1 flex flex-col bg-black relative">
      <button
        type="button"
        class="absolute right-5 top-5 z-20 rounded-full border border-white/10 bg-[#121214]/80 px-4 py-2 text-[11px] font-medium text-slate-200 hover:bg-white/10 transition-colors"
        @click="agentPanelOpen = !agentPanelOpen"
      >
        {{ agentPanelOpen ? '收起 AI 助手' : 'AI 助手' }}
      </button>

      <!-- 视频在上、色块在底部同一列同宽 -->
      <div class="flex flex-1 min-h-0 flex-col px-4 pt-14 pb-4">
        <div
          class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg ring-1 ring-white/10 bg-black gap-0"
        >
          <div class="flex min-h-0 flex-1 items-stretch justify-center bg-black">
            <video
              ref="videoPlayer"
              class="h-full w-full min-h-0 max-h-full object-contain"
              controls
              playsinline
              :src="currentVideo.url"
              @timeupdate="onTimeUpdate"
              @loadedmetadata="onVideoLoaded"
              @play="onVideoPlay"
              @pause="onVideoPause"
            />
          </div>

          <div
            v-if="currentSteps.length && fullTimelineSegments.length && totalDuration > 0"
            class="shrink-0 flex h-3 w-full gap-px border-t border-white/10 bg-black/50"
          >
            <div
              v-for="seg in fullTimelineSegments"
              :key="seg.id"
              class="h-full relative min-w-0 transition-all duration-300"
              :class="['cursor-pointer', seg.isGap ? 'hover:opacity-90' : 'hover:brightness-110']"
              :style="{ width: ((seg.end - seg.start) / totalDuration * 100) + '%' }"
              @click="onTimelineSegmentClick(seg)"
            >
              <div
                class="absolute inset-0 transition-all duration-500"
                :style="{ backgroundColor: seg.color }"
                :class="
                  seg.isGap
                    ? 'opacity-25'
                    : 'opacity-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' +
                      (currentTime >= seg.start && currentTime <= seg.end ? ' brightness-110' : '')
                "
              />
              <div
                v-if="(seg.end - seg.start) > 0 && currentTime >= seg.start && currentTime <= seg.end"
                class="absolute inset-y-0 left-0 z-[1] pointer-events-none"
                :class="seg.isGap ? 'bg-white/25' : 'bg-white/35'"
                :style="{ width: ((currentTime - seg.start) / (seg.end - seg.start) * 100) + '%' }"
              />
            </div>
          </div>
        </div>
      </div>

      <AIChatAgentPanel
        v-model="agentPanelOpen"
        :video-id="currentVideo?.id"
        :events-pipeline="displayPipeline"
      />
    </main>

    <aside class="w-96 flex-none bg-[#121214] border-l border-white/5 flex flex-col h-full">
      <div class="p-5 border-b border-white/5 flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-bold tracking-tight">Structured Analysis</h2>
        <div class="flex items-center gap-2">
          <button
            v-if="canEditEvents"
            type="button"
            class="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            :title="`按当前「${eventsEditorPipelineShort}」结果保存到时序库`"
            @click="eventsEditorOpen = true"
          >
            编辑（{{ eventsEditorPipelineShort }}）
          </button>
          <span class="text-[9px] text-slate-500">动作片段: {{ currentSteps.length }}</span>
        </div>
        </div>
        <div
          class="gap-2 items-stretch"
          :class="currentVideo?.analysisStatus === 'failed' ? 'flex flex-row' : ''"
        >
          <div
            class="flex min-w-0 flex-1 flex-col rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 space-y-1.5"
          >
            <p class="text-[9px] text-slate-500 uppercase tracking-wider">结果展示</p>
            <p class="text-[9px] text-slate-600 leading-snug">切换列表与时间轴数据源。</p>
            <div class="flex flex-col gap-1.5">
              <label class="flex cursor-pointer items-start gap-1.5 text-[10px] leading-snug text-slate-300">
                <input v-model="displayPipeline" type="radio" value="stack" class="accent-blue-500 mt-0.5 shrink-0" />
                <span>GLM + time-r1（{{ eventsStackCount }} 段）</span>
              </label>
              <label class="flex cursor-pointer items-start gap-1.5 text-[10px] leading-snug text-slate-300">
                <input v-model="displayPipeline" type="radio" value="glm_only" class="accent-blue-500 mt-0.5 shrink-0" />
                <span>GLM（{{ eventsGlmOnlyCount }} 段）</span>
              </label>
            </div>
          </div>
          <div
            v-if="currentVideo?.analysisStatus === 'failed'"
            class="flex min-w-0 flex-1 flex-col rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 space-y-1.5"
          >
            <p class="text-[9px] text-slate-500 uppercase tracking-wider">重新分析</p>
            <p class="text-[9px] text-slate-600 leading-snug">选择要重跑的管线后，点击下方「重新分析」。</p>
            <div class="flex flex-col gap-1.5">
              <label class="flex cursor-pointer items-start gap-1.5 text-[10px] leading-snug text-slate-300">
                <input v-model="reanalyzeMode" type="radio" value="stack" class="accent-blue-500 mt-0.5 shrink-0" />
                <span>重跑 GLM + time-r1</span>
              </label>
              <label class="flex cursor-pointer items-start gap-1.5 text-[10px] leading-snug text-slate-300">
                <input v-model="reanalyzeMode" type="radio" value="glm_only" class="accent-blue-500 mt-0.5 shrink-0" />
                <span>重跑 GLM</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <div
          v-if="currentVideo?.analysisStatus === 'pending'"
          class="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-8 text-center"
        >
          <p class="text-2xl mb-2 animate-pulse" aria-hidden="true">⚙️</p>
          <p class="text-xs text-slate-300 leading-relaxed">正在分析视频动作</p>
          
        </div>

        <div
          v-else-if="currentVideo?.analysisStatus === 'failed'"
          class="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-4 space-y-3"
        >
          <p class="text-[11px] text-red-200/90 leading-relaxed">
            {{ currentVideo.analysisError || '动作分析失败' }}
          </p>
          <button
            type="button"
            class="w-full rounded-lg border border-white/15 bg-white/5 py-2 text-[11px] text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            :disabled="analysisRetrying"
            @click="retryCurrentVideoAnalysis"
          >
            {{ analysisRetrying ? '提交中…' : '重新分析' }}
          </button>
        </div>

        <template v-else>
          <p
            v-if="!currentSteps.length"
            class="text-center py-10 text-[11px] text-slate-500 leading-relaxed"
          >
            暂无动作步骤数据
          </p>
          <div
            v-for="step in currentSteps"
            :key="`${displayPipeline}-${step.id}`"
            @click="selectStep(step)"
            :class="[
              'p-4 rounded-xl border-l-[4px] transition-all cursor-pointer group',
              activeStepId === step.id ? 'bg-white/[0.04] shadow-xl' : 'bg-white/[0.01] opacity-60 hover:opacity-100',
            ]"
            :style="{ borderColor: activeStepId === step.id ? step.color : 'transparent' }"
          >
            <div class="flex justify-between items-center mb-2">
              <span class="text-[10px] font-black uppercase tracking-widest" :style="{ color: step.color }">
                Step 0{{ step.id }}
              </span>
              <span class="text-[10px] font-mono opacity-40">{{ formatTime(step.start) }} - {{ formatTime(step.end) }}</span>
            </div>
            <p class="text-[13px] font-bold leading-relaxed mb-3">{{ step.action }}</p>
            <div v-if="activeStepId === step.id && step.think" class="mt-3 pt-3 border-t border-white/5 animate-in fade-in">
              <span class="text-[9px] font-mono opacity-50" :style="{ color: step.color }">&lt;think&gt;</span>
              <p class="text-[11px] text-slate-400 italic mt-1 leading-relaxed">{{ step.think }}</p>
            </div>
          </div>
        </template>
      </div>
    </aside>

    <VideoUploadInfoPanel
      v-model="uploadPanelOpen"
      v-model:run-stack-on-upload="runStackOnUpload"
      v-model:run-glm-only-on-upload="runGlmOnlyOnUpload"
      :is-uploading="isUploading"
      :file-info="pendingFileInfo"
      @file-chosen="onUploadPanelFile"
      @cancel-upload="onUploadPanelCancel"
    />

    <VideoEventsEditor
      v-model="eventsEditorOpen"
      :events="displayEvents"
      :pipeline-label="eventsEditorPipelineLabel"
      :video-name="currentVideo?.name"
      :video-duration-sec="totalDuration"
      :saving="eventsEditorSaving"
      @save="onEventsEditorSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  uploadVideo,
  waitForVideoAnalysisJob,
  reanalyzeVideo,
  type VideoAnalysisMode,
} from '../api/upload'
import { getVideoList, deleteVideo, updateVideoEvents, type VideoPipeline } from '../api/videos'
import VideoUploadInfoPanel from '../components/VideoUploadInfoPanel.vue'
import VideoEventsEditor from '../components/VideoEventsEditor.vue'
import type { EventEditRow } from '../components/VideoEventsEditor.vue'
import AIChatAgentPanel from '../components/AIChatAgentPanel.vue'

function pipelineSegCount(
  vid: { eventsStack?: unknown[]; eventsGlmOnly?: unknown[] },
  p: VideoPipeline,
): number {
  const arr = p === 'glm_only' ? vid?.eventsGlmOnly : vid?.eventsStack
  return Array.isArray(arr) ? arr.length : 0
}

// --- 状态定义 ---
const videoList = ref<any[]>([])
const currentVideo = ref<any>({
  id: 'init',
  name: '请上传视频',
  url: '',
  events: [],
  eventsStack: [],
  eventsGlmOnly: [],
  analysisStatus: 'idle',
})
const isUploading = ref(false)
const uploadPanelOpen = ref(false)
const uploadAbortController = ref<AbortController | null>(null)
const agentPanelOpen = ref(false)
const pendingFileInfo = ref<{ name: string; size: number; type?: string } | null>(null)
const deletingId = ref<string | null>(null)
const analysisRetrying = ref(false)
const runStackOnUpload = ref(true)
const runGlmOnlyOnUpload = ref(false)
/** 右侧列表 / 时间轴展示哪条管线的结果 */
const displayPipeline = ref<VideoPipeline>('stack')
/** 重新分析时跑哪条管线（可覆盖已存在结果） */
const reanalyzeMode = ref<VideoAnalysisMode>('stack')
const eventsEditorOpen = ref(false)
const eventsEditorSaving = ref(false)
const videoPlayer = ref<HTMLVideoElement | null>(null)
const currentTime = ref(0)
const totalDuration = ref(0.1) // 避免除以0
const activeStepId = ref(1)
/** 用户点击步骤/时间轴后，在 seek 完成前禁止用 timeupdate 的旧时间覆盖 activeStepId */
const pinActiveStepFromUser = ref(false)
let pinActiveStepTimer: ReturnType<typeof setTimeout> | null = null
const isPlaying = ref(false)

const STEP_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']

const eventsStackCount = computed(
  () => (Array.isArray(currentVideo.value?.eventsStack) ? currentVideo.value.eventsStack.length : 0),
)
const eventsGlmOnlyCount = computed(
  () => (Array.isArray(currentVideo.value?.eventsGlmOnly) ? currentVideo.value.eventsGlmOnly.length : 0),
)

const eventsEditorPipelineShort = computed(() =>
  displayPipeline.value === 'glm_only' ? '仅 GLM' : 'GLM+time-r1',
)

/** 与 PUT /events?pipeline= 一致，便于在弹窗内确认写入目标 */
const eventsEditorPipelineLabel = computed(() =>
  displayPipeline.value === 'glm_only'
    ? 'GLM'
    : 'GLM + time-r1',
)

/** 当前展示管线对应的事件列表 */
const displayEvents = computed(() => {
  const v = currentVideo.value
  if (!v || v.id === 'init') return []
  const stack = Array.isArray(v.eventsStack) ? v.eventsStack : []
  const glm = Array.isArray(v.eventsGlmOnly) ? v.eventsGlmOnly : []
  return displayPipeline.value === 'glm_only' ? glm : stack
})

// 由展示中的 events + 当前视频总时长 生成动作步骤（无时间戳时均分时间轴）
const currentSteps = computed(() => {
  const events = displayEvents.value
  const duration = totalDuration.value
  if (!events.length || duration <= 0) return []

  return events.map((e: any, i: number) => {
    const action = typeof e === 'string' ? e : (e?.action ?? '')
    const think = typeof e === 'object' && e ? (e.think ?? '') : ''
    return {
      id: i + 1,
      start: e.start || 0,
      end: e.end || 0,
      color: STEP_COLORS[i % STEP_COLORS.length],
      action,
      think,
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
})

const canEditEvents = computed(() => {
  const v = currentVideo.value
  if (!v?.id || v.id === 'init') return false
  if (v.analysisStatus === 'pending') return false
  return true
});

// --- 3. 初始化与上传 ---
onMounted(async () => {
  try {
    const list = await getVideoList()
    videoList.value = list.map((v) => ({
      ...v,
      eventsStack: v.eventsStack ?? v.events ?? [],
      eventsGlmOnly: v.eventsGlmOnly ?? [],
      timestamp: Date.now() - 50000,
    }))
    if (list.length > 0) switchVideo(videoList.value[0])
  } catch (err) { console.error('获取列表失败') }
})

watch(uploadPanelOpen, (open) => {
  if (open) pendingFileInfo.value = null
})

function onUploadPanelCancel() {
  uploadAbortController.value?.abort()
  uploadAbortController.value = null
  uploadPanelOpen.value = false
  pendingFileInfo.value = null
  isUploading.value = false
}

const onUploadPanelFile = async (file: File) => {
  pendingFileInfo.value = {
    name: file.name,
    size: file.size,
    type: file.type || undefined,
  }
  isUploading.value = true
  const ac = new AbortController()
  uploadAbortController.value = ac

  try {
    if (!runStackOnUpload.value && !runGlmOnlyOnUpload.value) {
      alert('请请选择分析模型管线')
      return
    }
    const res = await uploadVideo(file, {
      signal: ac.signal,
      runStack: runStackOnUpload.value,
      runGlmOnly: runGlmOnlyOnUpload.value,
    })
    const id =
      res.id || (res.url ? decodeURIComponent(res.url.split('/').pop() || '') : '') || String(Date.now())
    const isPending = !!(res.pending && res.jobId && res.url && res.id)
    const stack = res.eventsStack ?? res.events ?? []
    const glm = res.eventsGlmOnly ?? []
    const newVid = {
      id,
      name: file.name,
      url: res.url || URL.createObjectURL(file),
      timestamp: Date.now(),
      isNew: true,
      events: stack.length ? stack : glm,
      eventsStack: stack,
      eventsGlmOnly: glm,
      analysisStatus: isPending ? 'pending' : 'done',
      analysisError: undefined as string | undefined,
      analysisJobId: isPending ? res.jobId : undefined,
    }
    videoList.value.unshift(newVid)
    switchVideo(newVid)
    uploadPanelOpen.value = false
    if (isPending && res.jobId && res.url) {
      void pollAndApplyAnalysis(res.jobId, id, { url: res.url, id })
    }
  } catch (err: unknown) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    if (!aborted) alert('上传失败')
  } finally {
    uploadAbortController.value = null
    isUploading.value = false
  }
}

function patchVideoInList(videoId: string, patch: Record<string, unknown>) {
  const i = videoList.value.findIndex((v) => v.id === videoId)
  if (i === -1) return
  videoList.value[i] = { ...videoList.value[i], ...patch }
}

async function pollAndApplyAnalysis(
  jobId: string,
  listVideoId: string,
  partial: { url: string; id: string },
) {
  try {
    const final = await waitForVideoAnalysisJob(jobId, partial)
    const idx = videoList.value.findIndex((v) => v.id === listVideoId)
    const prev = idx >= 0 ? videoList.value[idx] : null
    const eventsStack = Array.isArray(final.eventsStack)
      ? final.eventsStack
      : (prev?.eventsStack ?? [])
    const eventsGlmOnly = Array.isArray(final.eventsGlmOnly)
      ? final.eventsGlmOnly
      : (prev?.eventsGlmOnly ?? [])
    const events = eventsStack.length ? eventsStack : eventsGlmOnly
    patchVideoInList(listVideoId, {
      events,
      eventsStack,
      eventsGlmOnly,
      analysisStatus: 'done',
      analysisError: undefined,
      analysisJobId: undefined,
    })
    if (currentVideo.value?.id === listVideoId) {
      currentVideo.value = {
        ...currentVideo.value,
        events,
        eventsStack,
        eventsGlmOnly,
        analysisStatus: 'done',
        analysisError: undefined,
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '分析失败'
    patchVideoInList(listVideoId, {
      analysisStatus: 'failed',
      analysisError: msg,
      analysisJobId: undefined,
    })
    if (currentVideo.value?.id === listVideoId) {
      currentVideo.value = {
        ...currentVideo.value,
        analysisStatus: 'failed',
        analysisError: msg,
      }
    }
  }
}

async function onEventsEditorSave(events: EventEditRow[]) {
  const id = currentVideo.value?.id
  if (!id || id === 'init') return
  eventsEditorSaving.value = true
  try {
    const pipeline: VideoPipeline =
      displayPipeline.value === 'glm_only' ? 'glm_only' : 'stack'
    const saved = await updateVideoEvents(id, events, { pipeline })
    const patch =
      pipeline === 'glm_only'
        ? { eventsGlmOnly: saved, events: saved, analysisStatus: 'done' }
        : { eventsStack: saved, events: saved, analysisStatus: 'done' }
    patchVideoInList(id, patch)
    currentVideo.value = {
      ...currentVideo.value,
      ...patch,
    }
    eventsEditorOpen.value = false
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : '保存失败')
  } finally {
    eventsEditorSaving.value = false
  }
}

async function retryCurrentVideoAnalysis() {
  const id = currentVideo.value?.id
  if (!id || id === 'init' || analysisRetrying.value) return
  const url = currentVideo.value.url
  analysisRetrying.value = true
  patchVideoInList(id, { analysisStatus: 'pending', analysisError: undefined })
  currentVideo.value = {
    ...currentVideo.value,
    analysisStatus: 'pending',
    analysisError: undefined,
  }
  try {
    const { jobId } = await reanalyzeVideo(id, { analysisMode: reanalyzeMode.value })
    void pollAndApplyAnalysis(jobId, id, { url, id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '重新分析失败'
    patchVideoInList(id, { analysisStatus: 'failed', analysisError: msg })
    if (currentVideo.value.id === id) {
      currentVideo.value = { ...currentVideo.value, analysisStatus: 'failed', analysisError: msg }
    }
  } finally {
    analysisRetrying.value = false
  }
}

// --- 4. 视频切换（动作数据来自 eventsStack / eventsGlmOnly + displayPipeline）---
const switchVideo = (vid: any) => {
  const stack = Array.isArray(vid.eventsStack) ? vid.eventsStack : vid.events ?? []
  const glm = Array.isArray(vid.eventsGlmOnly) ? vid.eventsGlmOnly : []
  const events = stack.length ? stack : glm
  displayPipeline.value =
    stack.length > 0 ? 'stack' : glm.length > 0 ? 'glm_only' : 'stack'
  currentVideo.value = {
    ...vid,
    eventsStack: stack,
    eventsGlmOnly: glm,
    events,
    analysisStatus:
      vid.analysisStatus ?? (events.length > 0 ? 'done' : 'idle'),
  }
}

const handleDeleteVideo = async (vid: any) => {
  if (deletingId.value) return
  const ok = window.confirm(`确认删除视频「${vid.name}」吗？`)
  if (!ok) return

  deletingId.value = vid.id
  try {
    await deleteVideo(vid.id)
    videoList.value = videoList.value.filter((v) => v.id !== vid.id)
    if (currentVideo.value?.id === vid.id) {
      const next = sortedVideoList.value[0]
      currentVideo.value = next || {
        id: 'init',
        name: '请上传视频',
        url: '',
        events: [],
        eventsStack: [],
        eventsGlmOnly: [],
        analysisStatus: 'idle',
      }
      if (!next) {
        currentTime.value = 0
        totalDuration.value = 0.1
        isPlaying.value = false
      }
    }
  } catch (err) {
    alert('删除失败')
  } finally {
    deletingId.value = null
  }
}

// --- 5. 播放器基础交互 ---
const onVideoLoaded = () => {
  if (videoPlayer.value) totalDuration.value = videoPlayer.value.duration
}

function onVideoPlay() {
  isPlaying.value = true
}

function onVideoPause() {
  isPlaying.value = false
}

const onTimeUpdate = () => {
  if (!videoPlayer.value) return
  const v = videoPlayer.value
  currentTime.value = v.currentTime
  // seek 过程中或刚点击后，currentTime 可能仍是旧值，不能用来改 activeStepId
  if (v.seeking || pinActiveStepFromUser.value) return

  const t = currentTime.value
  const steps = currentSteps.value
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i] as { start: number; end: number; id: number }
    const last = i === steps.length - 1
    const inSeg = last ? t >= s.start && t <= s.end : t >= s.start && t < s.end
    if (inSeg) {
      activeStepId.value = s.id
      break
    }
  }
}

function armPinActiveStepUntilSeeked() {
  pinActiveStepFromUser.value = true
  if (pinActiveStepTimer) {
    clearTimeout(pinActiveStepTimer)
    pinActiveStepTimer = null
  }
  const v = videoPlayer.value
  const unpin = () => {
    pinActiveStepFromUser.value = false
    if (pinActiveStepTimer) {
      clearTimeout(pinActiveStepTimer)
      pinActiveStepTimer = null
    }
  }
  if (!v) {
    pinActiveStepTimer = setTimeout(unpin, 0)
    return
  }
  v.addEventListener('seeked', unpin, { once: true })
  pinActiveStepTimer = setTimeout(unpin, 300)
}

/** 点击列表立即高亮并展开 think，避免只依赖 timeupdate 导致晚一拍 */
const selectStep = (step: { id: number; start: number }) => {
  activeStepId.value = step.id
  armPinActiveStepUntilSeeked()
  seekTo(step.start)
}

/** 高亮右侧步骤：落在某段动作内则对应该段；否则在间隙中取「下一段」或最后一段 */
function setActiveStepForTimelineSeek(t: number) {
  const steps = currentSteps.value as { start: number; end: number; id: number }[]
  if (!steps.length) return
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!
    const last = i === steps.length - 1
    const inSeg = last ? t >= s.start && t <= s.end : t >= s.start && t < s.end
    if (inSeg) {
      activeStepId.value = s.id
      return
    }
  }
  const upcoming = steps.find((x) => x.start >= t)
  const fallback = steps[steps.length - 1]!
  activeStepId.value = (upcoming ?? fallback).id
}

/** 动作段：从该段开始播；间隙段：从间隙起点播并高亮下一段（或末段） */
const onTimelineSegmentClick = (seg: { isGap?: boolean; id?: string | number; start?: number }) => {
  if (typeof seg.start !== 'number') return
  armPinActiveStepUntilSeeked()
  if (seg.isGap) {
    seekTo(seg.start)
    setActiveStepForTimelineSeek(seg.start)
    return
  }
  if (typeof seg.id === 'number') {
    activeStepId.value = seg.id
  }
  seekTo(seg.start)
}

const seekTo = (time: number) => {
  if (videoPlayer.value) {
    videoPlayer.value.currentTime = time
    videoPlayer.value.play()
    isPlaying.value = true
  }
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