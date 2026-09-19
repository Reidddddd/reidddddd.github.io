# API 契约（v1）

后端 API 与 GitHub Pages 前端共用以下契约。契约版本由响应头
`X-API-Contract-Version: 1` 标识；前端在解析响应前会校验该响应头。

## 请求

### `GET /api/health`

返回 `{"status":"ok"}`，表示 FastAPI 进程可以响应；该接口不检查 DeepSeek 等外部服务
是否可用。

### `GET /api/lunar-data`

可选查询参数 `solar_datetime` 使用 `YYYY-MM-DDTHH:MM` 格式。省略时使用当前本地时间。

响应包含 `nong_li`、`jie_qi`、`gan_zhi` 和 `lunar_cast` 四部分；`lunar_cast` 的字段
`yearShu`、`monthShu`、`dayShu`、`hourShu`、`minuteShu` 保持 camelCase，以兼容现有前端。

### `POST /api/qi-gua` 与 `POST /api/jie-gua`

请求体：

```json
{
  "cast_mode": "numbers",
  "numbers": [8, 13, 5],
  "question": "问题",
  "wai_ying": "无"
}
```

`cast_mode` 可取 `numbers`、`random`、`lunar`、`custom`，省略时默认为 `numbers`。
`numbers` 必须是整数数组：数字/天选模式使用 1 至 49，农历时模式使用 1 至 125，
自定义模式依次使用上卦 1 至 8、下卦 1 至 8、动爻 1 至 6。`jie-gua` 的 `question`
必须是非空字符串，`qi-gua` 可以为空。`wai_ying` 省略或为空时按 `无` 处理。

## SSE 响应

两个 POST 接口返回 `text/event-stream`。`data` 是 JSON 编码的字符串、对象或数组。

| 事件 | data | 说明 |
| --- | --- | --- |
| `progress` | 字符串 | 当前处理状态 |
| `thinking` | 字符串 | 推理状态提示，不传输原始思维内容 |
| `hexagrams` | `{ "guas": [...] }` | 五个卦的展示数据；每项含 `label`、`name`、`sym_shang`、`sym_xia`、`color_shang`、`color_xia`，可带 `zhou_yi` |
| `yi_li_chunk` | Markdown 字符串 | 专业解读增量；前端累积后统一清洗 |
| `result_chunk` | Markdown 字符串 | 白话解读增量；前端累积后统一清洗 |
| `result` | `{ "html": "..." }` | 白话解读完整安全 HTML |
| `yi_li` | `{ "html": "..." }` | 专业解读完整安全 HTML |
| `heartbeat` | 空字符串 | 保活事件，前端可以忽略 |
| `done` | 空字符串 | 流正常结束；前端只有收到它才视为完整结果 |
| `error` | 字符串 | 流式处理失败或限流提示 |

正常事件顺序为：

- 起卦：`progress` → `hexagrams` → `done`
- 解卦：`progress` → `hexagrams` → `progress` → 增量事件 → `result` → `yi_li` → `done`
- `heartbeat` 可以插入任意两个事件之间。
- 正式解卦失败时会降级为 `result` → `done`，此时可能没有 `yi_li`。

## HTTP 错误

非流式错误使用以下 JSON 结构：

```json
{
  "error": {
    "code": "invalid_request",
    "message": "请求体无效"
  },
  "request_id": "..."
}
```

输入错误使用 HTTP 400；限流使用 HTTP 429 并返回 SSE `error` 事件；服务错误使用
HTTP 500。前端分别展示输入、限流、服务失败和断线状态。

## 契约同步要求

任何请求字段、响应字段、事件名称、事件顺序或错误结构变更，都必须同时更新：

1. 后端的契约模型和 `src/test/api`、SSE 测试。
2. 前端的请求/事件处理和 `tests/browser-tests.js`。
3. 两个仓库各自的 `API_CONTRACT.md`、README 或开发文档。

不兼容变更还必须递增契约版本，并同步修改前端版本校验。
