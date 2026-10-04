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

页面脚本按以下顺序加载，`cast-request-controller.js` 使用动画模块的可取消等待：

```text
api-config.js → api-client.js → cast-state.js → lunar-picker.js
→ hexagram-renderer.js → jie-gua-result.js → cast-animations.js
→ cast-request-controller.js → app.js
```

主页控制按职责拆分：

- `app.js`：组装模块、绑定输入和重起事件，处理农历数据与布局同步。
- `cast-animations.js`：随机数滚动、背景旋转与可取消的展示等待。
- `cast-request-controller.js`：起卦／解卦请求、操作身份、取消、SSE 事件和结果收尾。

起卦业务状态仍只有 `CastStateMachine` 一份；结果、标签与保存继续由 `JieGuaResult` 管理。

两页都先加载 `site-theme.css`，再加载背景、导航和页面样式。共享主题统一配色、基础字体、
卡片、输入框、按钮和页脚链接外观；`app.css`、`guestbook.css`、`site-footer.css` 分别保留
各自的分栏、滚动、高度、移动端留白与页脚定位。不要为了共用样式而合并这些刻意保留的差异。

错误展示按响应类型区分：HTTP 4xx 显示请求错误，限流显示次数提示，SSE `error` 显示服务处理失败，网络失败或流提前结束显示连接状态；DeepSeek 失败沿用后端返回的降级结果提示。

起卦或解卦进行中会锁定输入；点击重起会取消当前请求，并清理未完成的动画和旧响应。

## 检查

```bash
make check
```

当前检查会执行以下脚本的语法检查：

```bash
node --check api-client.js
node --check cast-state.js
node --check lunar-picker.js
node --check hexagram-renderer.js
node --check jie-gua-result.js
node --check cast-animations.js
node --check cast-request-controller.js
node --check app.js
node --check guestbook.js
node --check tests/browser-tests.js
```

GitHub Actions 会在 `pisces` 分支的 push 和 Pull Request 上运行同一套 `make check`。

`make check` 还会运行 `tests/*.test.cjs` 的 Node 回归测试。SSE 契约测试使用实际 API 客户端
和结果模块，覆盖中文按字节分片、字符串 HTML 结果、降级、限流、流内错误及缺少 `done`；
不会请求真实 API 或调用模型。

时间滚轮回归测试运行实际 `LunarPicker`，仅模拟 DOM 节点与布局尺寸，覆盖选中边界、
首尾循环、锁定、重置、当前时间跟随、隐藏后恢复和布局变化；同时检查滚动期间的节点查询、
几何读取与高亮操作数量。它不替代真实浏览器的视觉或惯性滚动验证。

主页流程回归按 `index.html` 的实际脚本顺序运行页面代码，覆盖四种起卦模式、输入快照、
重起确认与取消、迟到响应、增量和最终结果、降级、错误提示、标签与保存、背景收尾及布局同步。
动画测试另外使用可控的计时器和帧回调检查随机数边界与资源清理；这些测试模拟 DOM、网络和尺寸，
不请求真实 API，也不替代真实浏览器的视觉验证。

共享主题测试检查样式加载顺序、变量引用和关键 CSS 声明，包括两页字体、导航、卡片、
移动端尺寸、古文滚动、保存按钮和“随喜，了缘”的位置约束；这是静态声明回归，
不模拟浏览器的完整层叠计算、实际布局或截图效果。

浏览器模块测试页面：

```text
http://127.0.0.1:9999/tests/browser-tests.html
```

测试页面不请求真实 API，会在浏览器中覆盖 SSE 分片解析、四种起卦模式和解卦结果标签切换。
