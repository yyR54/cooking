import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

const PORT = Number(process.env.PORT ?? 5174)
const ORIGIN = process.env.CORS_ORIGIN ?? '*' // 需要更严格可改成具体域名

const uploadsDir = path.resolve(__dirname, '..', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

app.use(
  cors({
    origin: ORIGIN,
    credentials: false,
  }),
)

// 让上传后的文件可通过 /uploads 访问
app.use('/uploads', express.static(uploadsDir))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '')
    const safeExt = ext && ext.length <= 10 ? ext : ''
    const name = `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`
    cb(null, name)
  },
})

const upload = multer({
  storage,
  limits: {
    // 视情况调大/调小，默认 2GB
    fileSize: Number(process.env.MAX_FILE_SIZE ?? 2 * 1024 * 1024 * 1024),
  },
  fileFilter: (_req, file, cb) => {
    // 放行常见视频 mime；如果浏览器/系统不给 mime，也允许（后续可做更严校验）
    if (!file.mimetype) return cb(null, true)
    if (file.mimetype.startsWith('video/')) return cb(null, true)
    return cb(new Error(`Unsupported mime type: ${file.mimetype}`))
  },
})

/**
 * 与前端默认一致：POST /api/upload/video
 * form-data:
 * - file: <video>
 */
app.post('/api/upload/video', upload.single('file'), (req, res) => {
  const f = req.file
  if (!f) {
    res.status(400).json({ message: 'No file uploaded' })
    return
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`
  const url = `${baseUrl}/uploads/${encodeURIComponent(f.filename)}`

  res.json({
    id: f.filename,
    url,
    message: 'ok',
  })
})

// 错误处理中间件（multer/自定义错误）
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const msg = err?.message || 'Internal Server Error'
  const status = msg.includes('File too large') ? 413 : 400
  res.status(status).json({ message: msg })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[back] listening on http://localhost:${PORT}`)
})

