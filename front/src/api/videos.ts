export type PastVideoItem = {
  id: string
  name: string
  url: string
  /** 已分析的动作/事件列表，来自 meta.json */
  events?: (string | { action?: string })[]
}

export type VideoListResponse = {
  list: PastVideoItem[]
}

const DEFAULT_ENDPOINT = '/dsw-691045/ide/proxy/5174//api/videos'

export async function getVideoList(endpoint = DEFAULT_ENDPOINT): Promise<PastVideoItem[]> {
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error('获取视频列表失败')
  const data = (await res.json()) as VideoListResponse
  return data.list ?? []
}
