<template>
  <Transition name="agent-fade">
    <section
      v-if="modelValue"
      class="absolute right-4 top-16 z-30 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#121214]/95 shadow-2xl shadow-black/60 backdrop-blur-sm"
      :class="{ 'select-none': isResizing }"
      :style="{ width: `${panelWidth}px`, height: `${panelHeight}px` }"
    >
      <header class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div class="min-w-0">
          <h3 class="text-sm font-semibold text-white">AI 智能体</h3>
          <p class="text-[10px] text-slate-500 mt-0.5">烹饪视频对话助手</p>
          <p
            v-if="videoId && videoId !== 'init'"
            class="mt-1 truncate text-[9px] text-amber-200/80"
            :title="pipelineHint"
          >
            动作数据：{{ pipelineHintShort }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md px-2 py-1 text-xs text-slate-300 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            :disabled="loading || !videoId"
            @click="quickSummary"
          >
            快速总结
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            @click="emit('update:modelValue', false)"
          >
            关闭
          </button>
        </div>
      </header>

      <div ref="listRef" class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="msg.role === 'user' ? 'text-right' : 'text-left'"
        >
          <div
            v-if="msg.isQuickSummary"
            class="inline-flex max-w-[90%] flex-col rounded-xl bg-white/5 text-slate-200 rounded-bl-sm border border-white/5 overflow-hidden"
          >
            <div class="w-full min-w-0 px-3 py-2.5">
              <MarkdownChatBody :source="msg.content" />
            </div>
            <div
              class="flex justify-end border-t border-white/10 bg-black/25 px-3 py-2"
            >
              <button
                type="button"
                class="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:pointer-events-none"
                :disabled="loading"
                @click="refreshQuickSummary(msg)"
              >
                重新总结
              </button>
            </div>
          </div>
          <div
            v-else
            :class="[
              'inline-block max-w-[90%] rounded-xl',
              msg.role === 'user'
                ? 'px-3 py-2 text-xs leading-relaxed bg-blue-600/90 text-white rounded-br-sm'
                : 'px-3 py-2.5 bg-white/5 text-slate-200 rounded-bl-sm',
            ]"
          >
            <MarkdownChatBody v-if="msg.role === 'assistant'" :source="msg.content" />
            <template v-else>{{ msg.content }}</template>
          </div>
        </div>
      </div>

      <form class="flex shrink-0 items-center gap-2 border-t border-white/10 p-3" @submit.prevent="sendMessage">
        <input
          v-model.trim="inputText"
          type="text"
          placeholder="请输入你的问题..."
          class="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-200 outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          :disabled="!inputText || !videoId || loading"
          class="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white transition-colors hover:bg-blue-500 disabled:pointer-events-none disabled:opacity-50"
        >
          {{ loading ? '处理中...' : '发送' }}
        </button>
      </form>

      <!-- 右上固定：向左下拖拽增大宽、高 -->
      <div
        ref="resizeHandleRef"
        class="resize-handle absolute bottom-0 left-0 z-20 flex h-7 w-7 cursor-nwse-resize touch-none items-end justify-start rounded-br-2xl p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300 active:bg-white/10"
        title="拖拽调整面板大小（右上位置不变）"
        @pointerdown="onResizePointerDown"
      >
        <svg
          class="pointer-events-none h-4 w-4 opacity-70"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.25"
          aria-hidden="true"
        >
          <path d="M2 14 L14 2 M6 14 L14 6 M10 14 L14 10" />
        </svg>
      </div>
    </section>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { chatWithVideoAI, summarizeVideoAI } from '../api/ai'
import type { VideoPipeline } from '../api/videos'
import MarkdownChatBody from './MarkdownChatBody.vue'

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  /** 快速总结结果气泡：右侧显示「重新总结」 */
  isQuickSummary?: boolean
  summaryVideoId?: string
}

const props = defineProps<{
  modelValue: boolean
  videoId?: string | null
  /** 与主界面「结果展示」同步，对话与总结均使用该管线的动作 JSON */
  eventsPipeline?: VideoPipeline
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const effectivePipeline = computed<VideoPipeline>(() =>
  props.eventsPipeline === 'glm_only' ? 'glm_only' : 'stack',
)

const pipelineHintShort = computed(() =>
  effectivePipeline.value === 'glm_only' ? '仅 GLM' : 'GLM + time-r1',
)

const pipelineHint = computed(
  () =>
    `当前为「${pipelineHintShort.value}」管线的动作步骤。`,
)

const listRef = ref<HTMLElement | null>(null)
const resizeHandleRef = ref<HTMLElement | null>(null)
let resizeCapturedPointerId: number | null = null
const inputText = ref('')
const loading = ref(false)

const PANEL_W_MIN = 280
const PANEL_H_MIN = 280
const PANEL_W_DEFAULT = 360
const PANEL_H_DEFAULT = 460

const panelWidth = ref(PANEL_W_DEFAULT)
const panelHeight = ref(PANEL_H_DEFAULT)
const isResizing = ref(false)

let resizeStartX = 0
let resizeStartY = 0
let resizeStartW = 0
let resizeStartH = 0

function clampPanelSize(w: number, h: number) {
  const padX = 24
  const padY = 72
  const maxW = Math.max(PANEL_W_MIN, Math.min(1200, window.innerWidth - padX))
  const maxH = Math.max(PANEL_H_MIN, Math.min(900, window.innerHeight - padY))
  return {
    w: Math.min(maxW, Math.max(PANEL_W_MIN, w)),
    h: Math.min(maxH, Math.max(PANEL_H_MIN, h)),
  }
}

function onResizePointerMove(e: PointerEvent) {
  if (!isResizing.value) return
  const dx = e.clientX - resizeStartX
  const dy = e.clientY - resizeStartY
  const { w, h } = clampPanelSize(resizeStartW - dx, resizeStartH + dy)
  panelWidth.value = Math.round(w)
  panelHeight.value = Math.round(h)
}

function endResize() {
  if (!isResizing.value) return
  isResizing.value = false
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  const el = resizeHandleRef.value
  if (el != null && resizeCapturedPointerId != null) {
    try {
      el.releasePointerCapture(resizeCapturedPointerId)
    } catch {
      /* ignore */
    }
  }
  resizeCapturedPointerId = null
}

function onResizePointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  resizeStartX = e.clientX
  resizeStartY = e.clientY
  resizeStartW = panelWidth.value
  resizeStartH = panelHeight.value
  isResizing.value = true
  resizeCapturedPointerId = e.pointerId
  window.addEventListener('pointermove', onResizePointerMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
  try {
    resizeHandleRef.value?.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

onBeforeUnmount(() => {
  endResize()
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) endResize()
  },
)
const messages = ref<ChatMessage[]>([
  { id: 1, role: 'assistant', content: '你好，我是 AI 智能体。你可以问我视频步骤、烹饪建议或复盘思路。' },
])
let idSeed = 2

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

async function sendMessage() {
  if (loading.value) return
  if (!props.videoId) {
    messages.value.push({ id: idSeed++, role: 'assistant', content: '请先选择一个视频，再进行对话。' })
    return
  }
  if (!inputText.value) return
  const text = inputText.value
  messages.value.push({ id: idSeed++, role: 'user', content: text })
  inputText.value = ''
  loading.value = true
  try {
    const answer = await chatWithVideoAI(props.videoId, text, {
      eventsPipeline: effectivePipeline.value,
    })
    messages.value.push({ id: idSeed++, role: 'assistant', content: answer })
  } catch (err: any) {
    messages.value.push({ id: idSeed++, role: 'assistant', content: `请求失败：${err?.message || '未知错误'}` })
  } finally {
    loading.value = false
  }
  scrollToBottom()
}

async function quickSummary() {
  if (loading.value) return
  if (!props.videoId) {
    messages.value.push({ id: idSeed++, role: 'assistant', content: '请先选择一个视频，再执行快速总结。' })
    return
  }
  messages.value.push({ id: idSeed++, role: 'assistant', content: '正在生成该视频的快速总结，请稍候...' })
  loading.value = true
  try {
    const summary = await summarizeVideoAI(props.videoId, {
      eventsPipeline: effectivePipeline.value,
    })
    messages.value.push({
      id: idSeed++,
      role: 'assistant',
      content: summary,
      isQuickSummary: true,
      summaryVideoId: props.videoId,
    })
  } catch (err: any) {
    messages.value.push({ id: idSeed++, role: 'assistant', content: `快速总结失败：${err?.message || '未知错误'}` })
  } finally {
    loading.value = false
  }
}

async function refreshQuickSummary(msg: ChatMessage) {
  if (loading.value || !msg.summaryVideoId) return
  const idx = messages.value.findIndex((m) => m.id === msg.id)
  if (idx === -1) return
  const row = messages.value[idx]
  if (!row) return

  loading.value = true
  const msgId = row.id
  messages.value[idx] = {
    id: msgId,
    role: 'assistant',
    content: '正在重新总结，请稍候...',
  }
  try {
    const summary = await summarizeVideoAI(msg.summaryVideoId, {
      forceRefresh: true,
      eventsPipeline: effectivePipeline.value,
    })
    messages.value[idx] = {
      id: msgId,
      role: 'assistant',
      content: summary,
      isQuickSummary: true,
      summaryVideoId: msg.summaryVideoId,
    }
  } catch (err: any) {
    messages.value[idx] = {
      id: msgId,
      role: 'assistant',
      content: `重新总结失败：${err?.message || '未知错误'}`,
    }
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

watch(messages, scrollToBottom, { deep: true })
</script>

<style scoped>
.agent-fade-enter-active,
.agent-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.agent-fade-enter-from,
.agent-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #2b2b2f; border-radius: 4px; }
</style>
