export type UploadVideoResponse = {
  url?: string
  id?: string
  message?: string
  /** 动作/事件列表，来自 AI 分析（异步任务完成前可能为空） */
  events?: (string | { action?: string })[]
  /** GLM + time-r1 管线结果 */
  eventsStack?: (string | { action?: string; start?: number; end?: number; think?: string })[]
  /** 仅 GLM 管线结果 */
  eventsGlmOnly?: (string | { action?: string; start?: number; end?: number; think?: string })[]
  jobId?: string
  pending?: boolean
}

/** stack：GLM 动作列表 + time-r1 对齐时间；glm_only：仅 GLM 估计时段 */
export type VideoAnalysisMode = 'stack' | 'glm_only'

export type UploadVideoOptions = {
  endpoint?: string
  fieldName?: string
  filename?: string
  extra?: Record<string, string>
  /** 未传 runStack/runGlmOnly 时使用单管线 */
  analysisMode?: VideoAnalysisMode
  /** 与 multipart 字段 runStack / runGlmOnly 对应，至少选一条 */
  runStack?: boolean
  runGlmOnly?: boolean
  onProgress?: (percent: number, loaded: number, total: number) => void
  signal?: AbortSignal
}

/** 与上传接口同源的轮询基址（DSW 代理前缀） */
const API_BASE = '/dsw-691045/ide/proxy/5174'

/**
 * 轮询直至视频分析任务完成或失败（上传 HTTP 结束后在页面中调用）
 */
export async function waitForVideoAnalysisJob(
  jobId: string,
  partial: { url: string; id: string },
  signal?: AbortSignal,
): Promise<UploadVideoResponse> {
  const pollIntervalMs = 2000
  const maxWaitMs = 30 * 60 * 1000
  const deadline = Date.now() + maxWaitMs

  await new Promise((r) => setTimeout(r, 800))

  while (Date.now() < deadline) {
    const statusRes = await fetch(
      `${API_BASE}/api/upload/job/${encodeURIComponent(jobId)}`,
      { signal },
    )
    const statusData = await statusRes.json()
    if (!statusRes.ok) {
      throw new Error(statusData?.message || statusData?.error || '查询分析状态失败')
    }
    if (statusData.status === 'done') {
      const eventsStack = Array.isArray(statusData.eventsStack) ? statusData.eventsStack : []
      const eventsGlmOnly = Array.isArray(statusData.eventsGlmOnly) ? statusData.eventsGlmOnly : []
      const events =
        Array.isArray(statusData.events) && statusData.events.length
          ? statusData.events
          : eventsStack.length
            ? eventsStack
            : eventsGlmOnly
      return {
        message: 'ok',
        url: partial.url,
        id: partial.id,
        events,
        eventsStack,
        eventsGlmOnly,
      }
    }
    if (statusData.status === 'failed') {
      throw new Error(statusData.error || '视频分析失败')
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
  throw new Error('分析等待超时，请稍后刷新页面查看')
}

/**
 * 对已落盘的视频重新发起分析（返回 jobId，需自行轮询）
 */
export async function reanalyzeVideo(
  videoId: string,
  options?: { signal?: AbortSignal; analysisMode?: VideoAnalysisMode },
): Promise<{ jobId: string; id: string }> {
  const analysisMode = options?.analysisMode ?? 'stack'
  const res = await fetch(
    `${API_BASE}/api/videos/${encodeURIComponent(videoId)}/reanalyze`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisMode }),
      signal: options?.signal,
    },
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message || data?.error || '重新分析任务创建失败')
  }
  if (!data.jobId) throw new Error('未返回 jobId')
  return { jobId: data.jobId, id: data.id ?? videoId }
}

/**
 * 上传视频文件；服务端在文件保存后立即响应（含异步分析 jobId 时不再阻塞等待分析结束）。
 * onProgress：开始 0%，收到 HTTP 响应后 100%（表示文件已传到服务端并拿到响应）。
 */
export function uploadVideo(
  file: File,
  options: UploadVideoOptions = {},
): Promise<UploadVideoResponse> {
  const endpoint = options.endpoint ?? `${API_BASE}/api/upload/video`
  const fieldName = options.fieldName ?? 'file'

  const form = new FormData()
  form.append(fieldName, file, options.filename ?? file.name)
  if (options.extra) {
    for (const [k, v] of Object.entries(options.extra)) form.append(k, v)
  }
  if (options.runStack !== undefined) {
    form.append('runStack', options.runStack ? 'true' : 'false')
  }
  if (options.runGlmOnly !== undefined) {
    form.append('runGlmOnly', options.runGlmOnly ? 'true' : 'false')
  }
  if (options.runStack === undefined && options.runGlmOnly === undefined && options.analysisMode) {
    form.append('analysisMode', options.analysisMode)
  }

  options.onProgress?.(0, 0, file.size)

  return fetch(endpoint, {
    method: 'POST',
    body: form,
    signal: options.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Upload failed: ${res.status}`)
    }
    options.onProgress?.(100, file.size, file.size)
    return (await res.json()) as UploadVideoResponse
  })
}
