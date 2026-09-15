# 梅花易数

静态前端页面。

## 本地启动

```bash
python3 -m http.server 9999 --bind 0.0.0.0
```

浏览器访问：

```text
http://127.0.0.1:9999
```

API 地址和请求头在 `api-config.js` 中按环境配置：

- `auto`：本地页面自动请求 `http://127.0.0.1:8888`，其他页面使用生产 API。
- `test`：将 `environment` 改为 `test`，并填入测试 API 地址。
- `production`：GitHub Pages 使用当前生产 API 地址。

本地前后端联调时，还需要把后端 `CORS_ORIGIN` 设置为
`http://127.0.0.1:9999`。

前端要求 API 响应携带 `X-API-Contract-Version: 1`；版本不匹配时不会继续解析响应。

错误展示按响应类型区分：HTTP 4xx 显示请求错误，限流显示次数提示，SSE `error` 显示服务处理失败，网络失败或流提前结束显示连接状态；DeepSeek 失败沿用后端返回的降级结果提示。

## 检查

```bash
make check
```

当前检查会执行：

```bash
node --check app.js
```
