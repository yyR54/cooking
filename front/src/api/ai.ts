import type { VideoPipeline } from './videos'

export type AiEventsPipelineOptions = {
  /** 与右侧「结果展示」一致：stack = GLM+time-r1，glm_only = 仅 GLM */
  eventsPipeline?: VideoPipeline
}

export async function chatWithVideoAI(
  videoId: string,
  question: string,
  options?: AiEventsPipelineOptions,
): Promise<string> {
  const res = await fetch('/dsw-691045/ide/proxy/5174/api/ai/chat', {
  //const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      question,
      eventsPipeline: options?.eventsPipeline ?? 'stack',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || data?.message || 'AI 对话失败')
  return data?.answer || ''
}

export type SummarizeVideoOptions = AiEventsPipelineOptions & { forceRefresh?: boolean }

export async function summarizeVideoAI(
  videoId: string,
  options?: SummarizeVideoOptions,
): Promise<string> {
  const startRes = await fetch('/dsw-691045/ide/proxy/5174/api/ai/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      forceRefresh: options?.forceRefresh === true,
      eventsPipeline: options?.eventsPipeline ?? 'stack',
    }),
  })
  const startData = await startRes.json()
  if (!startRes.ok) {
    throw new Error(startData?.error || startData?.message || 'AI 总结任务创建失败')
  }
  const directSummary = startData?.summary
  if (typeof directSummary === 'string' && directSummary.length > 0) {
    return directSummary
  }
  const jobId = startData?.jobId as string | undefined
  if (!jobId) throw new Error('未返回 jobId 或 summary')

  const pollIntervalMs = 2000
  const maxWaitMs = 12 * 60 * 1000
  const deadline = Date.now() + maxWaitMs

  await new Promise((r) => setTimeout(r, 600))

  while (Date.now() < deadline) {
    const statusRes = await fetch(`/dsw-691045/ide/proxy/5174/api/ai/summary/status/${encodeURIComponent(jobId)}`)
    const statusData = await statusRes.json()
    if (!statusRes.ok) {
      throw new Error(statusData?.message || statusData?.error || '查询总结状态失败')
    }
    if (statusData.status === 'done') return statusData.summary || ''
    if (statusData.status === 'failed') {
      throw new Error(statusData.error || 'AI 总结失败')
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
  }
  throw new Error('总结等待超时，请稍后重试')
}
