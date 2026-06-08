import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import OSS from 'ali-oss'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const PORT = Number(process.env.PORT) || 5174
const ORIGIN = process.env.ORIGIN || '*'
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY
const MYSQL_HOST = process.env.MYSQL_HOST
const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306
const MYSQL_USER = process.env.MYSQL_USER
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD
const MYSQL_DATABASE = process.env.MYSQL_DATABASE

const ossClient = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  secure: true
})
const uploadsDir = path.resolve(__dirname, '..', 'uploads')
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|mkv)$/i
// 读取作者 JSON 文件
const authorData = JSON.parse(
  fs.readFileSync(path.join(__dirname, './database.json'), 'utf8')
)

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

// 前端 dist 文件夹
const distPath = path.join(__dirname, '../../dist')
if (fs.existsSync(distPath)) {
  app.use('/', express.static(distPath))
}

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
})

// 初始化数据库
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      events_json LONGTEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_summary_jobs (
      id VARCHAR(36) PRIMARY KEY,
      video_id VARCHAR(255) NOT NULL,
      status VARCHAR(16) NOT NULL,
      summary LONGTEXT NULL,
      error TEXT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_ai_summary_video (video_id)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_analysis_jobs (
      id VARCHAR(36) PRIMARY KEY,
      video_id VARCHAR(255) NOT NULL,
      status VARCHAR(16) NOT NULL,
      events_json LONGTEXT NULL,
      error TEXT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_video_analysis_video (video_id)
    )
  `)
  await ensureVideosExtraColumns()
}

async function ensureVideosExtraColumns() {
  const addCol = async (sql) => {
    try {
      await pool.query(sql)
    } catch (e) {
      if (e?.code !== 'ER_DUP_FIELDNAME') throw e
    }
  }
  await addCol('ALTER TABLE videos ADD COLUMN oss_url VARCHAR(2048) NULL')
  await addCol('ALTER TABLE videos ADD COLUMN events_stack_json LONGTEXT NULL')
  await addCol('ALTER TABLE videos ADD COLUMN events_glm_only_json LONGTEXT NULL')
  try {
    await pool.query(
      `UPDATE videos SET events_stack_json = events_json
       WHERE (events_stack_json IS NULL OR events_stack_json = '')
         AND events_json IS NOT NULL AND events_json <> '' AND events_json <> '[]'`,
    )
  } catch {
    /* ignore */
  }
  try {
    await pool.query('ALTER TABLE ai_summary_jobs ADD COLUMN pipeline VARCHAR(16) NULL')
  } catch (e) {
    if (e?.code !== 'ER_DUP_FIELDNAME') throw e
  }
}

async function createVideoAnalysisJob(jobId, videoId) {
  const now = Date.now()
  await pool.query(
    `INSERT INTO video_analysis_jobs (id, video_id, status, events_json, error, created_at, updated_at)
     VALUES (?, ?, 'pending', NULL, NULL, ?, ?)`,
    [jobId, videoId, now, now],
  )
}

async function completeVideoAnalysisJob(jobId, eventsSnapshot) {
  const now = Date.now()
  const payload =
    eventsSnapshot == null ? null : JSON.stringify(eventsSnapshot)
  await pool.query(
    `UPDATE video_analysis_jobs SET status = 'done', events_json = ?, error = NULL, updated_at = ? WHERE id = ?`,
    [payload, now, jobId],
  )
}

async function failVideoAnalysisJob(jobId, errMsg) {
  const now = Date.now()
  await pool.query(
    `UPDATE video_analysis_jobs SET status = 'failed', events_json = NULL, error = ?, updated_at = ? WHERE id = ?`,
    [errMsg, now, jobId],
  )
}

async function getVideoAnalysisJob(jobId) {
  const [rows] = await pool.query(
    `SELECT id, video_id, status, events_json, error FROM video_analysis_jobs WHERE id = ? LIMIT 1`,
    [jobId],
  )
  return rows?.[0] ?? null
}

/** stack：GLM 出动作文案 + time-r1 对齐时间；glm_only：仅 GLM，由模型直接估计起止秒数 */
function normalizeAnalysisMode(raw) {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return v === 'glm_only' ? 'glm_only' : 'stack'
}

function parseGlmJsonPayload(raw) {
  let s = String(raw ?? '').trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im
  const m = s.match(fence)
  if (m) s = m[1].trim()
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start === -1 || end <= start) {
    throw new Error('GLM 返回中未找到合法 JSON 数组')
  }
  return JSON.parse(s.slice(start, end + 1))
}

function parseUploadPipelineModes(body) {
  const stackExplicit = body?.runStack
  const glmExplicit = body?.runGlmOnly
  if (stackExplicit !== undefined || glmExplicit !== undefined) {
    const modes = []
    if (stackExplicit === true || stackExplicit === 'true' || stackExplicit === '1') modes.push('stack')
    if (glmExplicit === true || glmExplicit === 'true' || glmExplicit === '1') modes.push('glm_only')
    if (modes.length) return [...new Set(modes.map(normalizeAnalysisMode))]
  }
  return [normalizeAnalysisMode(body?.analysisMode)]
}

function runVideoAnalysisJob(jobId, targetFilename, targetPath, displayName, modesInput) {
  const modes = Array.isArray(modesInput)
    ? [...new Set(modesInput.map(normalizeAnalysisMode))]
    : [normalizeAnalysisMode(modesInput)]
  ;(async () => {
    try {
      let row = await getVideoById(targetFilename)
      let ossurl = row?.oss_url || null
      if (!ossurl) {
        ossurl = await uploadToOSS(targetPath)
      }
      for (const mode of modes) {
        const events = await analyzeVideoWithOss(targetPath, mode, ossurl)
        await upsertVideoPipeline({
          id: targetFilename,
          name: displayName,
          mode,
          events,
          ossUrl: ossurl,
        })
        try {
          await deleteSummaryJobsForVideoPipeline(targetFilename, mode)
        } catch (e) {
          console.error('清除总结缓存失败', e)
        }
      }
      await completeVideoAnalysisJob(jobId, null)
    } catch (error) {
      console.error(error)
      await failVideoAnalysisJob(jobId, error.message)
    }
  })()
}

async function createSummaryJob(jobId, videoId, pipelineMode = 'stack') {
  const now = Date.now()
  const p = normalizeAnalysisMode(pipelineMode)
  await pool.query(
    `INSERT INTO ai_summary_jobs (id, video_id, pipeline, status, summary, error, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
    [jobId, videoId, p, now, now],
  )
}

async function completeSummaryJob(jobId, summary) {
  const now = Date.now()
  await pool.query(
    `UPDATE ai_summary_jobs SET status = 'done', summary = ?, error = NULL, updated_at = ? WHERE id = ?`,
    [summary, now, jobId],
  )
}

async function failSummaryJob(jobId, errMsg) {
  const now = Date.now()
  await pool.query(
    `UPDATE ai_summary_jobs SET status = 'failed', summary = NULL, error = ?, updated_at = ? WHERE id = ?`,
    [errMsg, now, jobId],
  )
}

async function getSummaryJob(jobId) {
  const [rows] = await pool.query(
    `SELECT id, video_id, status, summary, error, created_at, updated_at
     FROM ai_summary_jobs WHERE id = ? LIMIT 1`,
    [jobId],
  )
  return rows?.[0] ?? null
}

function summaryPipelineSqlFilter(pipelineMode) {
  const p = normalizeAnalysisMode(pipelineMode)
  if (p === 'glm_only') {
    return { clause: 'AND pipeline = ?', params: ['glm_only'] }
  }
  return { clause: 'AND (pipeline = ? OR pipeline IS NULL)', params: ['stack'] }
}

async function getLatestDoneSummaryForVideo(videoId, pipelineMode = 'stack') {
  const { clause, params } = summaryPipelineSqlFilter(pipelineMode)
  const [rows] = await pool.query(
    `SELECT summary FROM ai_summary_jobs
     WHERE video_id = ? AND status = 'done' AND summary IS NOT NULL AND summary <> ''
     ${clause}
     ORDER BY updated_at DESC LIMIT 1`,
    [videoId, ...params],
  )
  return rows?.[0] ?? null
}

async function getPendingSummaryJobForVideo(videoId, pipelineMode = 'stack') {
  const { clause, params } = summaryPipelineSqlFilter(pipelineMode)
  const [rows] = await pool.query(
    `SELECT id FROM ai_summary_jobs
     WHERE video_id = ? AND status = 'pending' ${clause}
     ORDER BY created_at DESC LIMIT 1`,
    [videoId, ...params],
  )
  return rows?.[0] ?? null
}

async function deleteSummaryJobsForVideo(videoId) {
  await pool.query('DELETE FROM ai_summary_jobs WHERE video_id = ?', [videoId])
}

/** 仅清除某条动作管线的总结缓存（切换管线后强刷总结用） */
async function deleteSummaryJobsForVideoPipeline(videoId, pipelineMode = 'stack') {
  const { clause, params } = summaryPipelineSqlFilter(pipelineMode)
  await pool.query(`DELETE FROM ai_summary_jobs WHERE video_id = ? ${clause}`, [
    videoId,
    ...params,
  ])
}

// 解析事件列表
function parseEvents(eventsJson) {
  try {
    const parsed = JSON.parse(eventsJson ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// 获取视频
async function getVideoById(id) {
  const [rows] = await pool.query(
    `SELECT id, name, events_json, events_stack_json, events_glm_only_json, oss_url,
            created_at, updated_at FROM videos WHERE id = ? LIMIT 1`,
    [id],
  )
  return rows?.[0] ?? null
}

// 整个视频列表

async function listVideoRows() {
  const [rows] = await pool.query(
    `SELECT id, name, events_json, events_stack_json, events_glm_only_json, oss_url, created_at
     FROM videos ORDER BY created_at DESC`,
  )
  return rows ?? []
}

// 删除视频
async function deleteVideoRow(id) {
  await pool.query('DELETE FROM videos WHERE id = ?', [id])
}

function eventsStackFromRow(row) {
  if (!row) return []
  const s = row.events_stack_json ?? row.events_json
  return parseEvents(s)
}

function eventsGlmOnlyFromRow(row) {
  if (!row) return []
  return parseEvents(row.events_glm_only_json)
}

/** 按管线合并写入；oss_url 首次上传后缓存，第二条管线只调 GLM 时直接复用 */
async function upsertVideoPipeline({ id, name, mode, events, ossUrl }) {
  const now = Date.now()
  const m = normalizeAnalysisMode(mode)
  const row = await getVideoById(id)
  let nextStack = eventsStackFromRow(row)
  let nextGlm = eventsGlmOnlyFromRow(row)
  if (m === 'stack') nextStack = Array.isArray(events) ? events : []
  if (m === 'glm_only') nextGlm = Array.isArray(events) ? events : []

  const stackJson = JSON.stringify(nextStack ?? [])
  const glmJson = JSON.stringify(nextGlm ?? [])
  const legacyJson = stackJson
  const finalOss = ossUrl || row?.oss_url || null

  await pool.query(
    `INSERT INTO videos (id, name, events_json, events_stack_json, events_glm_only_json, oss_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       events_json = VALUES(events_json),
       events_stack_json = VALUES(events_stack_json),
       events_glm_only_json = VALUES(events_glm_only_json),
       oss_url = COALESCE(VALUES(oss_url), oss_url),
       updated_at = VALUES(updated_at)`,
    [id, name, legacyJson, stackJson, glmJson, finalOss, now, now],
  )
}

// 获取视频的哈希，用于判断是否重复
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// 视频目录
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `temp-${Date.now()}-${path.basename(file.originalname || 'video')}`),
  }),
})

// 调用智谱AI函数，传入视频
async function callZhipuVideoAssistant({ ossurl, promptText }) {
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4.6v',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'video_url', video_url: { url: ossurl } },
            { type: 'text', text: promptText },
          ],
        },
      ],
      thinking: { type: 'enabled' },
    }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || '智谱 API 请求失败')
  }
  const result = await response.json()
  return result?.choices?.[0]?.message?.content || '未获得有效回复'
}
// 调用智谱AI函数，传入文本
async function callSimpleZhipuText(prompt) {
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4.6v',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const result = await response.json();
  return result?.choices?.[0]?.message?.content || '总结失败';
}

// 上传到 OSS得到公网可访问的URL
async function uploadToOSS(filePath) {
  const fileName = path.basename(filePath);
  const result = await ossClient.put(`videos/${fileName}`, filePath);
  return result.url;
}

// time-r1调用函数
async function callTimeR1(videoFilePath, actionList) {
  try {
    const formData = new FormData();
    const videoBuffer = fs.readFileSync(videoFilePath);
    formData.append('video', new Blob([videoBuffer]), 'video.mp4');

    formData.append('actions_json', JSON.stringify(actionList));

    const res = await fetch('http://127.0.0.1:1088/analyze_video', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("调用失败", err);
    throw err;
  }
}

const PROMPT_GLM_ACTION_STRINGS =
  '请分析这个烹饪视频，按时间阶段提取关键动作。\n' +
  '规则：\n' +
  '1. 同一时间段内一起发生的动作，合并成一条完整描述，不要拆成多条细小动作。\n' +
  '2. 动作数量控制在 3～8 条，按时间先后顺序。\n' +
  '3. 你的回复正文只能是「一个」合法的 JSON 数组，不要有任何前缀、后缀、说明文字。\n' +
  '4. 禁止使用 Markdown：不要输出 ``` 或 ```json 代码块；不要输出标题或列表符号。\n' +
  '5. 数组元素必须是中文字符串，每个字符串是一条动作描述；不要嵌套对象。\n' +
  '6. 第一个非空白字符必须是 [，最后一个非空白字符必须是 ]。\n' +
  '正确示例（仅此一行，可复制结构）：["向锅中倒油","翻炒食材","装盘"]'

const PROMPT_GLM_TIMED_OBJECTS =
  '请分析这个烹饪视频，按时间阶段提取关键动作，并为每一段给出在视频中的起止时间（单位：秒）。\n' +
  '规则：\n' +
  '1. 同一时间段内一起发生的动作，合并成一条完整描述。\n' +
  '2. 动作条数控制在 3～8 条，按时间先后排序；start、end 为非负数字（秒），且 start < end，时间段尽量不重叠。\n' +
  '3. 你的回复正文只能是「一个」合法的 JSON 数组，不要有任何前缀、后缀、说明文字。\n' +
  '4. 禁止使用 Markdown 代码块。\n' +
  '5. 每个元素必须是对象，字段：action（中文字符串）、start（数字）、end（数字）。可选 think（字符串，简短说明定位依据）。\n' +
  '6. 第一个非空白字符必须是 [，最后一个非空白字符必须是 ]。\n' +
  '正确示例：[{"action":"向锅中倒油","start":0.5,"end":8.2},{"action":"翻炒食材","start":8.2,"end":45}]'

async function glmActionStringList(ossurl) {
  console.log(`[GLM] 动作列表（供 time-r1）...`)
  const response = await callZhipuVideoAssistant({ ossurl, promptText: PROMPT_GLM_ACTION_STRINGS })
  const actionList = parseGlmJsonPayload(response)
  if (!Array.isArray(actionList) || !actionList.length) {
    throw new Error('GLM 动作列表解析失败或为空')
  }
  const strings = actionList.map((x) => (typeof x === 'string' ? x.trim() : String(x?.action ?? x ?? '').trim())).filter(Boolean)
  if (!strings.length) throw new Error('GLM 未返回有效动作描述')
  return strings
}

function normalizeTimedEventsFromGlm(parsed) {
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('GLM 时段 JSON 为空')
  }
  return parsed.map((item, i) => {
    if (typeof item === 'string') {
      return { action: item.trim(), start: 0, end: 0, think: '' }
    }
    const action = String(item?.action ?? item?.text ?? '').trim()
    let start = Number(item?.start)
    let end = Number(item?.end)
    if (!Number.isFinite(start)) start = 0
    if (!Number.isFinite(end)) end = start
    if (end < start) [start, end] = [end, start]
    const think = item?.think != null ? String(item.think) : ''
    return { action: action || `步骤${i + 1}`, start, end, think }
  })
}

async function glmTimedEventsOnly(ossurl) {
  console.log(`[GLM] 仅模型：直接估计动作与起止时间...`)
  const response = await callZhipuVideoAssistant({ ossurl, promptText: PROMPT_GLM_TIMED_OBJECTS })
  const parsed = parseGlmJsonPayload(response)
  console.log('[GLM timed-only raw]:', parsed)
  return normalizeTimedEventsFromGlm(parsed)
}

/** stack：GLM 文案 + time-r1（需本地文件）；glm_only：仅 GLM；ossurl 由调用方保证（可来自 DB 缓存） */
async function analyzeVideoWithOss(filePath, mode = 'stack', ossurl) {
  if (!ossurl) throw new Error('缺少视频 OSS 地址')
  console.log('----ossurl (cached or new)', ossurl)

  if (normalizeAnalysisMode(mode) === 'glm_only') {
    return glmTimedEventsOnly(ossurl)
  }

  const actionList = await glmActionStringList(ossurl)
  console.log('[AI Output]:', actionList)

  const timeR1Result = await callTimeR1(filePath, actionList)
  console.log('[Time-R1 Result]:', timeR1Result)
  if (!timeR1Result?.data || !Array.isArray(timeR1Result.data)) {
    throw new Error('time-r1 返回格式异常')
  }
  return timeR1Result.data.map((item) => ({
    action: item.action,
    start: item.start ?? 0,
    end: item.end,
    think: item.think,
  }))
}

// 从数据库中得到分析结果函数（eventsPipeline：stack | glm_only，与前端「结果展示」一致）
async function getVideoContextForAI(videoId, eventsPipeline = 'stack') {
  const safeName = path.basename(videoId || '')
  if (!safeName || !VIDEO_EXT.test(safeName)) {
    throw new Error('无效的视频 ID')
  }
  const row = await getVideoById(safeName)
  if (!row) throw new Error('数据库中不存在该视频记录')
  const targetPath = path.join(uploadsDir, safeName)
  if (!fs.existsSync(targetPath)) throw new Error('视频文件不存在')

  let ossurl = row.oss_url
  if (!ossurl) {
    ossurl = await uploadToOSS(targetPath)
    const now = Date.now()
    await pool.query(
      `UPDATE videos SET oss_url = COALESCE(oss_url, ?), updated_at = ? WHERE id = ?`,
      [ossurl, now, safeName],
    )
  }
  const mode = normalizeAnalysisMode(eventsPipeline)
  const stack = eventsStackFromRow(row)
  const glm = eventsGlmOnlyFromRow(row)
  const events = mode === 'glm_only' ? glm : stack
  const pipelineLabel =
    mode === 'glm_only' ? '仅 GLM（events_glm_only_json）' : 'GLM + time-r1（events_stack_json）'
  return {
    row,
    ossurl,
    events,
    pipelineLabel,
    eventsPipeline: mode,
  }
}

// 路由
app.use(cors({ origin: ORIGIN }))
app.use('/uploads', express.static(uploadsDir))

app.use((req, res, next) => {
  req.url = req.url.replace('/dsw-691045/ide/proxy/5174/', '');
  next();
})

/** 与列表接口一致：前端在 DSW 下需经 IDE 代理前缀才能访问同源下的 uploads */
function publicVideoUrl(req, filename) {
  const base = `${req.protocol}://${req.get('host')}/dsw-691045/ide/proxy/5174`
  return `${base}/uploads/${encodeURIComponent(filename)}`
}

// 列表接口
app.get('/api/videos', async (req, res) => {
  try {
    const rows = await listVideoRows()
    const list = rows
      .filter((r) => fs.existsSync(path.join(uploadsDir, r.id)))
      .map((r) => {
        const filename = r.id
        const name = r.name ?? (filename.replace(/^\d+-/, '').replace(/^[a-f0-9]+\./, '') || filename)
        const eventsStack = eventsStackFromRow(r)
        const eventsGlmOnly = eventsGlmOnlyFromRow(r)
        return {
          id: filename,
          name,
          url: publicVideoUrl(req, filename),
          events: eventsStack.length ? eventsStack : eventsGlmOnly,
          eventsStack,
          eventsGlmOnly,
          timestamp: r.created_at,
        }
      })
    res.json({ list })
  } catch (e) {
    res.status(500).json({ message: e?.message || '列表获取失败' })
  }
})

// 删除视频接口
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: '无效的视频 ID' })
    }
    const safeName = path.basename(id)
    if (!VIDEO_EXT.test(safeName)) {
      return res.status(400).json({ message: '不支持的视频类型' })
    }

    const targetPath = path.join(uploadsDir, safeName)
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ message: '视频不存在' })
    }

    fs.unlinkSync(targetPath)
    await deleteVideoRow(safeName)
    return res.json({ message: 'ok' })
  } catch (e) {
    return res.status(500).json({ message: e?.message || '删除失败' })
  }
})

// 手动更新动作与时序接口
app.put('/api/videos/:id/events', async (req, res) => {
  try {
    const rawId = req.params.id || ''
    const safeName = path.basename(rawId)
    if (!safeName || !VIDEO_EXT.test(safeName)) {
      return res.status(400).json({ message: '无效的视频 ID' })
    }
    const row = await getVideoById(safeName)
    if (!row) {
      return res.status(404).json({ message: '视频不存在' })
    }
    const pipeline = normalizeAnalysisMode(req.query?.pipeline ?? 'stack')
    const { events } = req.body || {}
    if (!Array.isArray(events)) {
      return res.status(400).json({ message: 'events 须为数组' })
    }
    if (events.length > 80) {
      return res.status(400).json({ message: '动作条数过多' })
    }
    const normalized = []
    for (let i = 0; i < events.length; i++) {
      const e = events[i]
      const action =
        typeof e === 'string' ? String(e).trim() : String(e?.action ?? '').trim()
      const start = Number(e?.start)
      const end = Number(e?.end)
      const think = typeof e === 'object' && e != null && e.think != null ? String(e.think) : ''
      if (!action) continue
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return res.status(400).json({ message: `第 ${i + 1} 条动作时间无效：${action}` })
      }
      if (start < 0) {
        return res.status(400).json({ message: `第 ${i + 1} 条开始时间不能为负` })
      }
      normalized.push({ action, start, end, think })
    }
    if (!normalized.length) {
      return res.status(400).json({ message: '请至少提交一条有效动作' })
    }
    await upsertVideoPipeline({
      id: safeName,
      name: row.name,
      mode: pipeline,
      events: normalized,
      ossUrl: row.oss_url,
    })
    await deleteSummaryJobsForVideoPipeline(safeName, pipeline)
    return res.json({ message: 'ok', events: normalized, pipeline })
  } catch (e) {
    return res.status(500).json({ message: e?.message || '保存失败' })
  }
})

// 上传视频接口
app.post('/api/upload/video', upload.single('file'), async (req, res) => {
  console.log('----上传开始')
  if (!req.file) return res.status(400).json({ message: '请上传视频' })

  const tempPath = req.file.path
  const ext = path.extname(req.file.originalname || '') || '.mp4'
  const modes = parseUploadPipelineModes(req.body)

  try {
    const hash = await getFileHash(tempPath)
    const targetFilename = `${hash}${ext}`
    const targetPath = path.join(uploadsDir, targetFilename)
    const buildUrl = () => publicVideoUrl(req, targetFilename)

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(tempPath)
      const record = await getVideoById(targetFilename)
      const stackEv = record ? eventsStackFromRow(record) : []
      const glmEv = record ? eventsGlmOnlyFromRow(record) : []
      const needStack = modes.includes('stack') && stackEv.length === 0
      const needGlm = modes.includes('glm_only') && glmEv.length === 0
      if (!needStack && !needGlm) {
        return res.json({
          id: targetFilename,
          events: stackEv.length ? stackEv : glmEv,
          eventsStack: stackEv,
          eventsGlmOnly: glmEv,
          url: buildUrl(),
          message: 'ok',
        })
      }
      const jobId = crypto.randomUUID()
      await createVideoAnalysisJob(jobId, targetFilename)
      res.json({
        jobId,
        id: targetFilename,
        url: buildUrl(),
        pending: true,
      })
      const runModes = []
      if (needStack) runModes.push('stack')
      if (needGlm) runModes.push('glm_only')
      runVideoAnalysisJob(
        jobId,
        targetFilename,
        targetPath,
        req.file.originalname || targetFilename,
        runModes,
      )
      return
    }

    fs.renameSync(tempPath, targetPath)
    console.log('----地址', targetPath)
    const jobId = crypto.randomUUID()
    await createVideoAnalysisJob(jobId, targetFilename)
    res.json({
      jobId,
      id: targetFilename,
      url: buildUrl(),
      pending: true,
    })
    runVideoAnalysisJob(
      jobId,
      targetFilename,
      targetPath,
      req.file.originalname || targetFilename,
      modes,
    )
  } catch (error) {
    if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath) } catch { }
    console.error(error)
    if (!res.headersSent) {
      res.status(500).json({ message: 'AI 分析失败', error: error.message })
    }
  }
})

// 查询分析状态接口
app.get('/api/upload/job/:jobId', async (req, res) => {
  try {
    const job = await getVideoAnalysisJob(req.params.jobId)
    if (!job) return res.status(404).json({ message: '任务不存在' })
    let events = null
    let eventsStack = null
    let eventsGlmOnly = null
    if (job.status === 'done') {
      const row = await getVideoById(job.video_id)
      if (row) {
        eventsStack = eventsStackFromRow(row)
        eventsGlmOnly = eventsGlmOnlyFromRow(row)
        events = eventsStack.length ? eventsStack : eventsGlmOnly
      } else if (job.events_json) {
        events = parseEvents(job.events_json)
      }
    }
    return res.json({
      status: job.status,
      events,
      eventsStack,
      eventsGlmOnly,
      error: job.error,
      id: job.video_id,
    })
  } catch (error) {
    return res.status(500).json({ message: '查询任务失败', error: error.message })
  }
})

// 重新分析视频接口
app.post('/api/videos/:id/reanalyze', async (req, res) => {
  try {
    const rawId = req.params.id || ''
    const safeName = path.basename(rawId)
    if (!safeName || !VIDEO_EXT.test(safeName)) {
      return res.status(400).json({ message: '无效的视频 ID' })
    }
    const targetPath = path.join(uploadsDir, safeName)
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ message: '视频文件不存在' })
    }
    const row = await getVideoById(safeName)
    const displayName = row?.name || safeName
    const analysisMode = normalizeAnalysisMode(req.body?.analysisMode)
    const jobId = crypto.randomUUID()
    await createVideoAnalysisJob(jobId, safeName)
    res.json({
      jobId,
      id: safeName,
      pending: true,
    })
    runVideoAnalysisJob(jobId, safeName, targetPath, displayName, [
      analysisMode,
    ])
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: '创建重新分析任务失败', error: error.message })
    }
  }
})

// AI对话接口
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { videoId, question, eventsPipeline } = req.body || {}
    if (!videoId) return res.status(400).json({ message: '缺少 videoId' })
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ message: '问题不能为空' })
    }

    const { row, ossurl, events, pipelineLabel } = await getVideoContextForAI(
      videoId,
      eventsPipeline,
    )
    const emptyHint =
      events.length === 0
        ? '\n（注意：当前所选动作分析管线下暂无步骤数据，可提示用户切换管线或先完成分析。）\n'
        : ''
    const promptText =
      `你是一个烹饪视频分析助手。\n` +
      `当前视频名称：${row.name}\n` +
      `当前动作分析管线：${pipelineLabel}\n` +
      `动作分析结果（JSON）：${JSON.stringify(events, null, 2)}\n` +
      emptyHint +
      `用户问题：${question}\n` +
      `请结合视频内容回答用户的内容。`

    const answer = await callZhipuVideoAssistant({ ossurl, promptText })
    console.log('----AI结果', answer)
    return res.json({ answer })
  } catch (error) {
    return res.status(500).json({ message: 'AI 对话失败', error: error.message })
  }
})

// AI总结接口
app.post('/api/ai/summary', async (req, res) => {
  try {
    const { videoId, forceRefresh, eventsPipeline } = req.body || {}
    if (!videoId) return res.status(400).json({ message: '缺少 videoId' })
    const videoRow = await getVideoById(videoId)
    if (!videoRow) return res.status(404).json({ message: '视频不存在' })
    const pipelineMode = normalizeAnalysisMode(eventsPipeline)

    if (forceRefresh === true || forceRefresh === 'true') {
      await deleteSummaryJobsForVideoPipeline(videoId, pipelineMode)
    }

    const cached = await getLatestDoneSummaryForVideo(videoId, pipelineMode)
    if (cached?.summary) {
      return res.json({ summary: cached.summary, cached: true })
    }

    const pending = await getPendingSummaryJobForVideo(videoId, pipelineMode)
    if (pending?.id) {
      return res.json({ jobId: pending.id })
    }

    const { row, ossurl, events, pipelineLabel } = await getVideoContextForAI(
      videoId,
      pipelineMode,
    )

    const authorAnnotations = authorData.database[row.name.split('.')[0]]?.annotations || [];
    const authorEvents = authorAnnotations.map(a => ({
      start: a.segment[0],
      end: a.segment[1],
      action: a.sentence
    }));

    const myText = JSON.stringify(events, null, 2);
    const standardText = JSON.stringify(authorEvents, null, 2);

    const promptText =
      `你是烹饪视频动作时序评测专家，请严格对比【我的分析结果】和【作者标准结果】，输出专业对比总结\n` +
      `当前「我的分析结果」来自动作管线：${pipelineLabel}\n` +
      `作者标准结果为${standardText}` +
      `我的分析结果是${myText}` +
      `请按以下结构返回中文：\n` +
      `1) 动作是否完整（漏/多动作说明）\n` +
      `2) 动作描述语义是否匹配\n` +
      `3) 时间戳误差大不大\n` +
      `4) 动作顺序是否正确\n` +
      `5) 综合评分 0~100\n` +
      `6) 改进建议（1-3条）`

    const jobId = crypto.randomUUID()
    await createSummaryJob(jobId, videoId, pipelineMode)

    res.json({ jobId })

    ;(async () => {
      try {
        const summary = await callSimpleZhipuText(promptText)
        await completeSummaryJob(jobId, summary)
      } catch (error) {
        await failSummaryJob(jobId, error.message)
      }
    })()
  } catch (error) {
    return res.status(500).json({ message: 'AI 快速总结失败', error: error.message })
  }
})

// 查询总结状态接口
app.get('/api/ai/summary/status/:jobId', async (req, res) => {
  try {
    const job = await getSummaryJob(req.params.jobId)
    if (!job) return res.status(404).json({ message: '任务不存在' })
    return res.json({ status: job.status, summary: job.summary, error: job.error })
  } catch (error) {
    return res.status(500).json({ message: '查询任务失败', error: error.message })
  }
})

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () =>
      console.log(`服务已启动: http://0.0.0.0:${PORT}`),
    )
  })
  .catch((err) => {
    console.error('MySQL 初始化失败:', err)
    process.exit(1)
  })
