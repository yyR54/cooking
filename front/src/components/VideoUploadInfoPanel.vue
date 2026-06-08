<template>
  <Teleport to="body">
    <Transition name="panel-fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-panel-title"
        @click.self="onBackdropClick"
      >
        <div
          class="w-full max-w-md rounded-2xl border border-white/10 bg-[#121214] shadow-2xl shadow-black/50 text-slate-200 overflow-hidden"
          @click.stop
        >
          <div class="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <h2 id="upload-panel-title" class="text-sm font-semibold tracking-tight text-white">
              视频上传
            </h2>
            <button
              type="button"
              class="rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
              :aria-label="isUploading ? '取消上传并关闭' : '关闭'"
              @click="close"
            >
              ✕
            </button>
          </div>

          <div class="p-6 space-y-5">
            <div class="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 space-y-1.5">
              <p class="text-[9px] text-slate-500 uppercase tracking-wider">上传后运行的分析</p>
              <div class="flex flex-col gap-1.5">
                <label class="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                  <input v-model="runStackOnUpload" type="checkbox" class="accent-blue-500 rounded" />
                  <span>GLM + time-r1</span>
                </label>
                <label class="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                  <input v-model="runGlmOnlyOnUpload" type="checkbox" class="accent-blue-500 rounded" />
                  <span>GLM</span>
                </label>
              </div>
            </div>

            <div
              v-if="!fileInfo && !isUploading"
              class="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center"
            >
              <p class="text-[11px] text-slate-500 mb-4">选择本地视频文件开始上传与分析</p>
              <label
                class="inline-flex cursor-pointer items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
              >
                选择文件
                <input
                  ref="fileInputRef"
                  type="file"
                  class="hidden"
                  accept="video/*"
                  @change="onFileChange"
                />
              </label>
            </div>

            <template v-else>
              <div class="rounded-xl border border-white/8 bg-white/[0.03] p-4 space-y-3">
                <div class="flex items-start gap-3">
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-lg">
                    🎬
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-medium text-white truncate" :title="fileInfo?.name">
                      {{ fileInfo?.name ?? '—' }}
                    </p>
                    <p class="mt-1 text-[10px] text-slate-500 font-mono">
                      {{ fileInfo ? formatBytes(fileInfo.size) : '—' }}
                      <span v-if="fileInfo?.type" class="text-slate-600"> · {{ fileInfo.type }}</span>
                    </p>
                  </div>
                </div>

                <div v-if="isUploading" class="pt-2 text-center space-y-1.5">
                  <p class="text-xs text-slate-300">正在上传中…</p>
                </div>

                <p v-else-if="fileInfo" class="text-[10px] text-slate-500">
                  点击下方按钮可重新选择文件
                </p>
              </div>

              <label
                v-if="!isUploading && fileInfo"
                class="flex w-full cursor-pointer items-center justify-center rounded-xl border border-white/10 py-2.5 text-[11px] text-slate-400 hover:border-white/20 hover:text-slate-200 transition-colors"
              >
                重新选择
                <input type="file" class="hidden" accept="video/*" @change="onFileChange" />
              </label>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{
  modelValue: boolean
  isUploading: boolean
  fileInfo: { name: string; size: number; type?: string } | null
}>()

const runStackOnUpload = defineModel<boolean>('runStackOnUpload', { default: true })
const runGlmOnlyOnUpload = defineModel<boolean>('runGlmOnlyOnUpload', { default: false })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'file-chosen': [file: File]
  /** 上传进行中时关闭面板：取消网络请求 */
  'cancel-upload': []
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function close() {
  if (props.isUploading) {
    emit('cancel-upload')
    return
  }
  emit('update:modelValue', false)
}

function onBackdropClick() {
  close()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  emit('file-chosen', file)
  input.value = ''
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && fileInputRef.value) fileInputRef.value.value = ''
  },
)
</script>

<style scoped>
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.2s ease;
}
.panel-fade-enter-active > div:last-child,
.panel-fade-leave-active > div:last-child {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}
.panel-fade-enter-from > div:last-child,
.panel-fade-leave-to > div:last-child {
  opacity: 0;
  transform: scale(0.96) translateY(6px);
}
</style>
