<template>
  <Teleport to="body">
    <Transition name="editor-fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="events-editor-title"
        @click.self="emitClose"
      >
        <div
          class="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#121214] shadow-2xl text-slate-200 overflow-hidden"
          @click.stop
        >
          <header class="shrink-0 px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 id="events-editor-title" class="text-sm font-semibold text-white">编辑动作与时序</h2>
              <p
                v-if="pipelineLabel"
                class="mt-1.5 inline-flex max-w-full rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-100/90"
              >
                保存至：{{ pipelineLabel }}
              </p>
              <p v-if="videoName" class="text-[10px] text-slate-500 mt-1 truncate" :title="videoName">{{ videoName }}</p>
              <p v-if="displayDuration > 0" class="text-[10px] text-slate-600 mt-0.5">
                视频时长约 {{ displayDuration.toFixed(1) }}s（起止时间单位为秒）
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-white/5"
              aria-label="关闭"
              @click="emitClose"
            >
              ✕
            </button>
          </header>

          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar">
            <div
              v-for="(row, i) in rows"
              :key="i"
              class="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-mono text-slate-500">#{{ i + 1 }}</span>
                <div class="flex gap-1">
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-white/10 hover:text-slate-200 disabled:opacity-30"
                    :disabled="i === 0"
                    @click="moveUp(i)"
                  >
                    上移
                  </button>
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-white/10 hover:text-slate-200 disabled:opacity-30"
                    :disabled="i === rows.length - 1"
                    @click="moveDown(i)"
                  >
                    下移
                  </button>
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 text-[10px] text-red-400/80 hover:bg-red-500/15"
                    @click="removeRow(i)"
                  >
                    删除
                  </button>
                </div>
              </div>
              <label class="block">
                <span class="text-[10px] text-slate-500">动作描述</span>
                <input
                  v-model="row.action"
                  type="text"
                  class="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500"
                  placeholder="例如：向锅中倒油"
                />
              </label>
              <div class="grid grid-cols-2 gap-2">
                <label class="block">
                  <span class="text-[10px] text-slate-500">开始 (s)</span>
                  <input
                    v-model.number="row.start"
                    type="number"
                    step="0.1"
                    min="0"
                    class="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs font-mono text-slate-100 outline-none focus:border-blue-500"
                  />
                </label>
                <label class="block">
                  <span class="text-[10px] text-slate-500">结束 (s)</span>
                  <input
                    v-model.number="row.end"
                    type="number"
                    step="0.1"
                    min="0"
                    class="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs font-mono text-slate-100 outline-none focus:border-blue-500"
                  />
                </label>
              </div>
              <label class="block">
                <span class="text-[10px] text-slate-500">思考说明（可选）</span>
                <textarea
                  v-model="row.think"
                  rows="2"
                  class="mt-0.5 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px] text-slate-300 outline-none focus:border-blue-500"
                  placeholder="可选"
                />
              </label>
            </div>

            <button
              type="button"
              class="w-full rounded-xl border border-dashed border-white/15 py-2 text-[11px] text-slate-500 hover:border-white/25 hover:text-slate-300 transition-colors"
              @click="addRow"
            >
              + 添加一条动作
            </button>

            <p v-if="localError" class="text-[11px] text-red-400/90">{{ localError }}</p>
          </div>

          <footer class="shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-white/10 bg-black/20">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
              :disabled="saving"
              @click="emitClose"
            >
              取消
            </button>
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              :disabled="saving"
              :title="pipelineLabel ? `写入数据库：${pipelineLabel}` : '保存到服务器'"
              @click="trySave"
            >
              {{ saving ? '保存中…' : '保存到服务器' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

export type EventEditRow = { action: string; start: number; end: number; think: string }

const props = defineProps<{
  modelValue: boolean
  events: unknown[]
  /** 与右侧「结果展示」所选管线一致；保存时写入对应库列 */
  pipelineLabel?: string
  videoName?: string
  videoDurationSec?: number
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  save: [events: EventEditRow[]]
}>()

const displayDuration = computed(() => props.videoDurationSec ?? 0)

const rows = ref<EventEditRow[]>([])
const localError = ref('')

function toRows(src: unknown[]): EventEditRow[] {
  const d = Math.max(props.videoDurationSec ?? 0, 1)
  if (!src?.length) {
    return [{ action: '', start: 0, end: d, think: '' }]
  }
  return src.map((e: any) => {
    const action = typeof e === 'string' ? e : String(e?.action ?? '')
    const think = typeof e === 'object' && e != null ? String(e.think ?? '') : ''
    let start = Number(typeof e === 'object' ? e?.start : NaN)
    let end = Number(typeof e === 'object' ? e?.end : NaN)
    if (!Number.isFinite(start)) start = 0
    if (!Number.isFinite(end)) end = start
    return { action, start, end, think }
  })
}

function syncRowsFromProps() {
  localError.value = ''
  rows.value = toRows(props.events || [])
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) syncRowsFromProps()
  },
)

/** 打开状态下切换「结果展示」管线时，重新载入当前管线的事件列表 */
watch(
  () => [props.modelValue, props.events, props.pipelineLabel] as const,
  () => {
    if (props.modelValue) syncRowsFromProps()
  },
)

function emitClose() {
  emit('update:modelValue', false)
}

function addRow() {
  const d = Math.max(props.videoDurationSec ?? 60, 1)
  const last = rows.value[rows.value.length - 1]
  const start = last ? Number(last.end) || 0 : 0
  rows.value.push({
    action: '',
    start,
    end: Math.min(start + Math.min(10, d - start) || d, d),
    think: '',
  })
}

function removeRow(i: number) {
  rows.value.splice(i, 1)
  if (!rows.value.length) {
    rows.value = toRows([])
  }
}

function moveUp(i: number) {
  if (i <= 0) return
  const copy = [...rows.value]
  const a = copy[i - 1]
  const b = copy[i]
  if (!a || !b) return
  copy[i - 1] = b
  copy[i] = a
  rows.value = copy
}

function moveDown(i: number) {
  if (i >= rows.value.length - 1) return
  const copy = [...rows.value]
  const a = copy[i]
  const b = copy[i + 1]
  if (!a || !b) return
  copy[i] = b
  copy[i + 1] = a
  rows.value = copy
}

function trySave() {
  localError.value = ''
  const out: EventEditRow[] = []
  for (let i = 0; i < rows.value.length; i++) {
    const r = rows.value[i]!
    const action = (r.action || '').trim()
    const start = Number(r.start)
    const end = Number(r.end)
    if (!action) continue
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      localError.value = `第 ${i + 1} 条：起止时间必须是数字`
      return
    }
    if (end < start) {
      localError.value = `第 ${i + 1} 条「${action}」：结束时间不能小于开始时间`
      return
    }
    if (start < 0) {
      localError.value = `第 ${i + 1} 条：开始时间不能为负`
      return
    }
    out.push({
      action,
      start,
      end,
      think: (r.think || '').trim(),
    })
  }
  if (!out.length) {
    localError.value = '请至少保留一条有描述的动作，或填写动作描述'
    return
  }
  emit('save', out)
}
</script>

<style scoped>
.editor-fade-enter-active,
.editor-fade-leave-active {
  transition: opacity 0.2s ease;
}
.editor-fade-enter-from,
.editor-fade-leave-to {
  opacity: 0;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #2b2b2f;
  border-radius: 4px;
}
</style>
