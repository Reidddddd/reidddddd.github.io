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

Node.js 版本由 `.nvmrc` 锁定；使用 nvm 时可运行 `nvm use` 切换到项目版本。

API 地址和请求头在 `api-config.js` 中按环境配置：

- `auto`：本地页面自动请求 `http://127.0.0.1:8888`，其他页面使用生产 API。
- `test`：将 `environment` 临时改为 `test`，请求本地 SSH 隧道转发的测试 API
  `http://127.0.0.1:8889`。
- `production`：GitHub Pages 使用当前生产 API 地址。

本地前后端联调时，还需要把后端 `CORS_ORIGIN` 设置为
`http://127.0.0.1:9999`。

测试实例端口转发：

```bash
ssh -N -L 8889:127.0.0.1:8889 ubuntu@<ip>
```

灰度测试结束后，将 `api-config.js` 的 `environment` 恢复为 `auto`；不要让公开的
GitHub Pages 页面使用 `test` 配置。

后端服务不在本仓库启动或管理；前端只通过 `api-config.js` 选择 API 地址。

## 部署决策

当前保留无构建依赖的静态部署方式，不引入 npm、打包器或前端构建流水线：

- GitHub Pages 可直接提供 HTML、CSS 和 JavaScript 静态文件。
- 脚本加载顺序已经在 `index.html` 中明确，便于定位运行时问题。
- `make check` 和浏览器测试页覆盖了当前需要的基础检查。
- CI 使用 `.nvmrc` 中锁定的 Node.js 版本运行 `make check`。

只有在需要代码转译、资源压缩、文件指纹或构建产物管理时，才重新评估引入构建工具。届时需要同时承担 Node.js 版本、依赖锁定、构建流水线和本地部署方式的维护成本。

## GitHub Pages 来源

生产站点 `https://reidddddd.github.io/` 由本仓库的 `pisces` 分支根目录提供。后端仓库中的旧模板和静态资源仅作为回退路径，不作为 GitHub Pages 来源；正式前端页面只在本仓库维护。

生产 API 地址唯一配置在 `api-config.js` 的 `production.baseUrl`。如果生产 API 地址
发生变化，只更新这里并重新发布 `pisces`；不要在 `app.js` 或测试文件中重复配置。

前端要求 API 响应携带 `X-API-Contract-Version: 1`；版本不匹配时不会继续解析响应。

完整请求、响应和 SSE 事件定义见 [API_CONTRACT.md](API_CONTRACT.md)。契约变更时，必须同步更新后端仓库的契约文档、测试和接口实现。

页面脚本按 `api-config.js`、`api-client.js`、`cast-state.js`、`lunar-picker.js`、`hexagram-renderer.js`、`jie-gua-result.js`、`app.js` 顺序加载。

错误展示按响应类型区分：HTTP 4xx 显示请求错误，限流显示次数提示，SSE `error` 显示服务处理失败，网络失败或流提前结束显示连接状态；DeepSeek 失败沿用后端返回的降级结果提示。

起卦或解卦进行中会锁定输入；点击重起会取消当前请求，并清理未完成的动画和旧响应。

## 检查

```bash
make check
```

当前检查会执行七个前端脚本的语法检查：

```bash
node --check api-client.js
node --check cast-state.js
node --check lunar-picker.js
node --check hexagram-renderer.js
node --check jie-gua-result.js
node --check app.js
node --check tests/browser-tests.js
```

GitHub Actions 会在 `pisces` 分支的 push 和 Pull Request 上运行同一套 `make check`。

浏览器模块测试页面：

```text
http://127.0.0.1:9999/tests/browser-tests.html
```

测试页面不请求真实 API，会在浏览器中覆盖 SSE 分片解析、四种起卦模式和解卦结果标签切换。
