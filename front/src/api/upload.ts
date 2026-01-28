export type UploadVideoResponse = {
  url?: string
  id?: string
  message?: string
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
 * 用 XMLHttpRequest 上传以支持上传进度回调。
 * 默认接口：POST /api/upload/video
 */
export function uploadVideo(file: File, options: UploadVideoOptions = {}) {
  const endpoint = options.endpoint ?? '/api/upload/video'
  const fieldName = options.fieldName ?? 'file'

  const form = new FormData()
  form.append(fieldName, file, options.filename ?? file.name)
  if (options.extra) {
    for (const [k, v] of Object.entries(options.extra)) form.append(k, v)
  }

  const xhr = new XMLHttpRequest()

  const promise = new Promise<UploadVideoResponse>((resolve, reject) => {
    xhr.open('POST', endpoint, true)

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return
      const percent = evt.total > 0 ? Math.round((evt.loaded / evt.total) * 100) : 0
      options.onProgress?.(percent, evt.loaded, evt.total)
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return
      const status = xhr.status
      const text = xhr.responseText ?? ''
      if (status >= 200 && status < 300) {
        try {
          resolve(text ? (JSON.parse(text) as UploadVideoResponse) : {})
        } catch {
          resolve({ message: text })
        }
      } else {
        reject(new Error(text || `Upload failed: ${status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Network error'))

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort()
        reject(new Error('Aborted'))
        return
      }
      options.signal.addEventListener(
        'abort',
        () => {
          xhr.abort()
          reject(new Error('Aborted'))
        },
        { once: true },
      )
    }

    xhr.send(form)
  })

  return { xhr, promise }
}

