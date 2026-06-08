export type PastVideoItem = {
  id: string
  name: string
  url: string
  events?: (string | { action?: string })[]
  eventsStack?: (string | { action?: string; start?: number; end?: number; think?: string })[]
  eventsGlmOnly?: (string | { action?: string; start?: number; end?: number; think?: string })[]
}

export type VideoListResponse = {
  list: PastVideoItem[]
}

const DEFAULT_ENDPOINT = '/dsw-691045/ide/proxy/5174/api/videos'
//const DEFAULT_ENDPOINT = '/api/videos'
export async function getVideoList(endpoint = DEFAULT_ENDPOINT): Promise<PastVideoItem[]> {
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error('获取视频列表失败')
  const data = (await res.json()) as VideoListResponse
  return data.list ?? []
}

export async function deleteVideo(id: string, endpoint = DEFAULT_ENDPOINT): Promise<void> {
  const safeId = encodeURIComponent(id)
  const res = await fetch(`${endpoint}/${safeId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('删除视频失败')
}

export type VideoEventPayload = {
  action: string
  start: number
  end: number
  think?: string
}

export type VideoPipeline = 'stack' | 'glm_only'

export async function updateVideoEvents(
  id: string,
  events: VideoEventPayload[],
  options?: { pipeline?: VideoPipeline; endpoint?: string },
): Promise<VideoEventPayload[]> {
  const endpoint = options?.endpoint ?? DEFAULT_ENDPOINT
  const safeId = encodeURIComponent(id)
  const pipeline = options?.pipeline === 'glm_only' ? 'glm_only' : 'stack'
  const q = new URLSearchParams({ pipeline })
  const res = await fetch(`${endpoint}/${safeId}/events?${q.toString()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || '保存动作失败')
  }
  return (data as { events?: VideoEventPayload[] }).events ?? events
}
