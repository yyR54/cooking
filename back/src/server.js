import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/dsw-691045/ide/proxy/5174/api', (req, res, next) => {
  req.url = req.url.replace('/dsw-691045/ide/proxy/5174/api', '/api')
  next()
})
// --- 配置区域 ---
const PORT = Number(process.env.PORT ?? 5174)
const ORIGIN = process.env.CORS_ORIGIN ?? '*'
const ZHIPU_API_KEY = 'bf4fc5b20c94425d809bf18e07a1ceec.Av1HsBCj3gRlyQvR'

const uploadsDir = path.resolve(__dirname, '..', 'uploads')
const metaPath = path.join(uploadsDir, 'meta.json')
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|mkv)$/i

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

// ==========================
// ✅ 关键：托管前端 dist 文件夹
// ==========================
const distPath = path.join(__dirname, '../../dist')
if (fs.existsSync(distPath)) {
  app.use('/', express.static(distPath))
}

function readMeta() {
  if (!fs.existsSync(metaPath)) return { videos: {} }
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  } catch {
    return { videos: {} }
  }
}

function writeMeta(meta) {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
}

function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

app.use(cors({ origin: ORIGIN }))
app.use('/uploads', express.static(uploadsDir))

app.get('/api/videos', (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}/dsw-691045/ide/proxy/5174`
    const meta = readMeta()
    const names = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : []
    const list = names
      .filter((n) => VIDEO_EXT.test(n) && !n.startsWith('temp-'))
      .filter((n) => fs.statSync(path.join(uploadsDir, n)).isFile())
      .map((filename) => {
        const info = meta.videos?.[filename]
        const name = info?.name ?? (filename.replace(/^\d+-/, '').replace(/^[a-f0-9]+\./, '') || filename)
        return {
          id: filename,
          name,
          url: `${baseUrl}/uploads/${encodeURIComponent(filename)}`,
          events: info?.events ?? [],
        }
      })
      .sort((a, b) => (a.id > b.id ? -1 : 1))
    res.json({ list })
  } catch (e) {
    res.status(500).json({ message: e?.message || '列表获取失败' })
  }
})

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `temp-${Date.now()}-${path.basename(file.originalname || 'video')}`),
  }),
})

// ==========================
// ✅ 关键：DSW 内部调用 Time-R1
// ==========================
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

async function analyzeVideoWithGLM(filePath) {
  const videoBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
  console.log(`[GLM] 正在发送视频分析请求...`);

  const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ZHIPU_API_KEY}`
    },
    body: JSON.stringify({
      model: "glm-4.6v-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "video_url", video_url: { url: videoBase64 } },
            {
              type: "text",
              text: "请分析这个烹饪视频，按时间阶段提取关键动作。规则：1. 同一时间段内一起发生的动作，合并成一条完整描述，不要拆成多条细小动作。2. 动作数量控制在 3～8 条，按先后顺序。3. 只返回纯 JSON 数组，无任何多余内容、无解释、无代码块、无换行。4. 格式示例：[\"动作1\",\"动作2\",\"动作3\"]"
            }
          ]
        }
      ],
      thinking: { type: "enabled" }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "智谱 API 请求失败");
  }

  const result = await response.json();
  const responseText = result.choices[0].message.content;
  console.log('[AI Output]:', responseText);

  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const actionList = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    const timeR1Result = await callTimeR1(filePath, actionList);
    console.log('[Time-R1 Result]:', timeR1Result);
    return timeR1Result.data.map(item => ({
      action: item.action,
      start: item.start ?? 0,
      end: item.end
    }));
  } catch (e) {
    return [responseText.trim()];
  }
}

app.post('/api/upload/video', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '请上传视频' })

  const tempPath = req.file.path
  const baseUrl = `${req.protocol}://${req.get('host')}`
  const ext = path.extname(req.file.originalname || '') || '.mp4'

  try {
    const hash = await getFileHash(tempPath)
    const targetFilename = `${hash}${ext}`
    const targetPath = path.join(uploadsDir, targetFilename)

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(tempPath)
      const meta = readMeta()
      let events = meta.videos?.[targetFilename]?.events
      if (!events) {
        events = await analyzeVideoWithGLM(targetPath)
        if (!meta.videos) meta.videos = {}
        meta.videos[targetFilename] = { name: req.file.originalname || targetFilename, events }
        writeMeta(meta)
      }
      return res.json({
        events,
        url: `${baseUrl}/uploads/${encodeURIComponent(targetFilename)}`,
        message: 'ok',
      })
    }

    fs.renameSync(tempPath, targetPath)
    const events = await analyzeVideoWithGLM(targetPath)
    const meta = readMeta()
    if (!meta.videos) meta.videos = {}
    meta.videos[targetFilename] = { name: req.file.originalname || targetFilename, events }
    writeMeta(meta)

    res.json({
      events,
      url: `${baseUrl}/uploads/${encodeURIComponent(targetFilename)}`,
      message: 'ok',
    })
  } catch (error) {
    if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath) } catch { }
    console.error(error)
    res.status(500).json({ message: 'AI 分析失败', error: error.message })
  }
})

// ==========================
// ✅ 关键：监听 0.0.0.0
// ==========================
app.listen(PORT, '0.0.0.0', () =>
  console.log(`服务已启动: http://0.0.0.0:${PORT}`)
);