<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { uploadVideo } from '../api/upload'

type Status = 'idle' | 'ready' | 'uploading' | 'success' | 'error'

const accept = 'video/mp4,video/webm,video/ogg,video/quicktime'
const maxSizeMB = 500

const file = ref<File | null>(null)
const status = ref<Status>('idle')
const errorMsg = ref('')
const dragging = ref(false)

const videoUrl = ref<string>('')
const uploadedUrl = ref<string>('')
const percent = ref(0)
const loaded = ref(0)
const total = ref(0)

let abortController: AbortController | null = null
let currentXhr: XMLHttpRequest | null = null

const sizeLabel = computed(() => {
  if (!total.value) return ''
  const mb = total.value / 1024 / 1024
  return `${mb.toFixed(1)} MB`
})

function resetAll() {
  cancelUpload()
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  file.value = null
  status.value = 'idle'
  errorMsg.value = ''
  videoUrl.value = ''
  uploadedUrl.value = ''
  percent.value = 0
  loaded.value = 0
  total.value = 0
}

function setError(msg: string) {
  status.value = 'error'
  errorMsg.value = msg
}

function validateVideo(f: File) {
  if (!f.type.startsWith('video/')) return '请选择视频文件'
  const allowed = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'])
  if (!allowed.has(f.type)) return '仅支持 mp4 / webm / ogg / mov'
  const maxBytes = maxSizeMB * 1024 * 1024
  if (f.size > maxBytes) return `文件过大：上限 ${maxSizeMB}MB`
  return ''
}

function pickFileFromInput(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f) chooseFile(f)
}

function chooseFile(f: File) {
  const err = validateVideo(f)
  if (err) return setError(err)

  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  file.value = f
  status.value = 'ready'
  errorMsg.value = ''
  uploadedUrl.value = ''
  percent.value = 0
  loaded.value = 0
  total.value = f.size
  videoUrl.value = URL.createObjectURL(f)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) chooseFile(f)
}

function cancelUpload() {
  abortController?.abort()
  abortController = null
  if (currentXhr) {
    try {
      currentXhr.abort()
    } catch {
      // ignore
    }
  }
  currentXhr = null
  if (status.value === 'uploading') status.value = 'ready'
}

async function startUpload() {
  if (!file.value) return
  errorMsg.value = ''
  uploadedUrl.value = ''
  percent.value = 0
  loaded.value = 0
  total.value = file.value.size
  status.value = 'uploading'

  abortController = new AbortController()

  try {
    const { xhr, promise } = uploadVideo(file.value, {
      endpoint: '/api/upload/video',
      fieldName: 'file',
      signal: abortController.signal,
      onProgress: (p, l, t) => {
        percent.value = p
        loaded.value = l
        total.value = t
      },
      extra: {
        biz: 'recipe-video',
      },
    })
    currentXhr = xhr

    const res = await promise
    status.value = 'success'
    uploadedUrl.value = res.url ?? res.id ?? ''
  } catch (err: any) {
    if (String(err?.message || err).toLowerCase().includes('aborted')) return
    setError(err?.message || '上传失败')
  } finally {
    abortController = null
    currentXhr = null
  }
}

watch(file, (f) => {
  if (!f) return
  // 进入 ready 状态时清掉 error
  if (status.value === 'error') status.value = 'ready'
})

onBeforeUnmount(() => {
  cancelUpload()
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
})
</script>

<template>
  <section class="page">
    <div class="title">
      <h1>视频上传</h1>
      <p class="sub">支持拖拽上传，显示预览与上传进度（默认接口：<code>/api/upload/video</code>）。</p>
    </div>

    <div class="card">
      <div
        class="drop"
        :class="{ dragging, disabled: status === 'uploading' }"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <div class="dropInner">
          <div class="icon">⬆</div>
          <div class="text">
            <div class="headline">拖拽视频到这里</div>
            <div class="hint">或点击选择文件（mp4/webm/ogg/mov，≤ {{ maxSizeMB }}MB）</div>
          </div>

          <label class="btn secondary">
            选择文件
            <input
              class="fileInput"
              type="file"
              :accept="accept"
              :disabled="status === 'uploading'"
              @change="pickFileFromInput"
            />
          </label>
        </div>
      </div>

      <div v-if="status !== 'idle'" class="meta">
        <div class="row">
          <div class="k">文件</div>
          <div class="v">
            <span class="mono">{{ file?.name }}</span>
            <span class="dim">（{{ sizeLabel }}）</span>
          </div>
        </div>
        <div class="row">
          <div class="k">类型</div>
          <div class="v"><span class="mono">{{ file?.type }}</span></div>
        </div>
      </div>

      <div v-if="errorMsg" class="alert error">
        <div class="alertTitle">出错了</div>
        <div class="alertBody">{{ errorMsg }}</div>
      </div>

      <div v-if="videoUrl" class="preview">
        <video class="player" :src="videoUrl" controls preload="metadata" />
      </div>

      <div v-if="status === 'uploading' || status === 'success'" class="progress">
        <div class="bar">
          <div class="barInner" :style="{ width: percent + '%' }" />
        </div>
        <div class="progressRow">
          <div class="dim">进度：{{ percent }}%</div>
          <div class="dim">
            {{ (loaded / 1024 / 1024).toFixed(1) }} / {{ (total / 1024 / 1024).toFixed(1) }} MB
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn primary" :disabled="!file || status === 'uploading'" @click="startUpload">
          {{ status === 'success' ? '重新上传' : '开始上传' }}
        </button>
        <button class="btn" :disabled="status !== 'uploading'" @click="cancelUpload">取消</button>
        <button class="btn ghost" :disabled="status === 'uploading' && !!file" @click="resetAll">清空</button>
      </div>

      <div v-if="status === 'success'" class="alert success">
        <div class="alertTitle">上传完成</div>
        <div class="alertBody">
          <div v-if="uploadedUrl">
            返回：<span class="mono">{{ uploadedUrl }}</span>
          </div>
          <div v-else class="dim">接口未返回 url/id（你可以按后端协议改一下解析）。</div>
        </div>
      </div>
    </div>

    <div class="tips">
      <div class="tipTitle">后端对接提示</div>
      <ul>
        <li>接口默认：<code>POST /api/upload/video</code>，表单字段名：<code>file</code>。</li>
        <li>如果你有鉴权 token，可在 <code>src/api/upload.ts</code> 里给 XHR 加 header。</li>
        <li>如果需要分片/断点续传，我也可以继续帮你扩展成 chunk 上传。</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: grid;
  gap: 14px;
}
.title h1 {
  font-size: 20px;
  margin: 0 0 6px;
}
.sub {
  margin: 0;
  color: rgba(229, 231, 235, 0.72);
}
.card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 16px 60px rgba(0, 0, 0, 0.25);
}
.drop {
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.03);
  padding: 18px;
  transition: background 120ms, border-color 120ms, transform 120ms;
}
.drop.dragging {
  border-color: rgba(99, 102, 241, 0.9);
  background: rgba(99, 102, 241, 0.12);
  transform: translateY(-1px);
}
.drop.disabled {
  opacity: 0.65;
  pointer-events: none;
}
.dropInner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 700;
}
.text {
  flex: 1;
  min-width: 220px;
}
.headline {
  font-weight: 700;
}
.hint {
  margin-top: 4px;
  color: rgba(229, 231, 235, 0.65);
  font-size: 13px;
}
.fileInput {
  display: none;
}
.meta {
  margin-top: 12px;
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
}
.k {
  color: rgba(229, 231, 235, 0.55);
}
.v {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 13px;
}
.dim {
  color: rgba(229, 231, 235, 0.55);
}
.preview {
  margin-top: 12px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.35);
}
.player {
  width: 100%;
  max-height: 420px;
  display: block;
}
.progress {
  margin-top: 12px;
}
.bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.barInner {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.95), rgba(16, 185, 129, 0.9));
  transition: width 120ms linear;
}
.progressRow {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  font-size: 13px;
}
.actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(229, 231, 235, 0.92);
  padding: 9px 12px;
  border-radius: 12px;
  cursor: pointer;
  user-select: none;
}
.btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn.primary {
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.18);
}
.btn.secondary {
  border-color: rgba(255, 255, 255, 0.18);
}
.btn.ghost {
  background: transparent;
}
.alert {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
}
.alertTitle {
  font-weight: 700;
  margin-bottom: 4px;
}
.alert.error {
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.12);
}
.alert.success {
  border-color: rgba(16, 185, 129, 0.45);
  background: rgba(16, 185, 129, 0.12);
}
.tips {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  padding: 14px 16px;
  color: rgba(229, 231, 235, 0.78);
}
.tipTitle {
  font-weight: 700;
  margin-bottom: 8px;
  color: rgba(229, 231, 235, 0.92);
}
code {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 8px;
}
ul {
  margin: 0;
  padding-left: 18px;
}
</style>

