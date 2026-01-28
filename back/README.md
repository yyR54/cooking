# back（视频上传接口）

## 启动

```bash
cd back
npm i
npm run dev
```

默认端口：`5174`（可用环境变量 `PORT` 覆盖）

## 接口

### 健康检查

- `GET /health`

### 上传视频

- `POST /api/upload/video`
- `Content-Type: multipart/form-data`
- 表单字段：`file`

成功返回示例：

```json
{
  "id": "1700000000000-abcd1234.mp4",
  "url": "http://localhost:5174/uploads/1700000000000-abcd1234.mp4",
  "message": "ok"
}
```

上传后的文件可通过：

- `GET /uploads/<filename>`

## 可选环境变量

- `PORT`: 监听端口
- `CORS_ORIGIN`: 允许的跨域来源（默认 `*`）
- `MAX_FILE_SIZE`: 最大上传大小（字节，默认 2GB）

