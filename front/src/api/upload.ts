export type UploadVideoResponse = {
  url?: string
  id?: string
  message?: string
  /** 动作/事件列表，来自 AI 分析 */
  events?: (string | { action?: string })[]
}

export type UploadVideoOptions = {
  endpoint?: string
  fieldName?: string
  filename?: string
  extra?: Record<string, string>
  onProgress?: (percent: number, loaded: number, total: number) => void
  signal?: AbortSignal
}

/**
 * 使用 fetch 上传视频。
 * 默认接口：POST /api/upload/video
 * 注：fetch 无法获取上传进度，onProgress 仅在开始(0)和成功(100)时调用。
 */
export function uploadVideo(
  file: File,
  options: UploadVideoOptions = {},
): Promise<UploadVideoResponse> {
  const endpoint = options.endpoint ?? '/dsw-691045/ide/proxy/5174//api/upload/video'
  const fieldName = options.fieldName ?? 'file'

  const form = new FormData()
  form.append(fieldName, file, options.filename ?? file.name)
  if (options.extra) {
    for (const [k, v] of Object.entries(options.extra)) form.append(k, v)
  }

  options.onProgress?.(0, 0, file.size)

  return fetch(endpoint, {
    method: 'POST',
    body: form,
    signal: options.signal,
  }).then((res) => {
    if (!res.ok) {
      return res.text().then((text) => {
        throw new Error(text || `Upload failed: ${res.status}`)
      })
    }
    options.onProgress?.(100, file.size, file.size)
    return res.json() as Promise<UploadVideoResponse>
  })
}

