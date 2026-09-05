# 周行事例批注台（Weekly Schedule Annotation Desk）

依据 `E:\docs\weekly-schedule-requirements.html`（需求设计文档 V1.0，[本地相对路径](../../docs/weekly-schedule-requirements.html)）完成的**纯前端单页应用**：导入周行事例 → 自动解析为日历事件 → 按日添加多条批注 → 统计可视化与导出，数据本地持久化。

## 快速开始

两种方式均可（无需构建）：

1. 直接双击打开 `index.html`（所有依赖已本地化到 `vendor/`，可离线运行）；
2. 或启动本地静态服务：

```bash
npm run serve        # python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

> 注意：浏览器 ES Module 存在 file:// CORS 限制，本项目刻意采用经典脚本（UMD 风格命名空间 `WS.*`），因此直接双击 `index.html` 也可正常使用。

## 手机访问（同一 Wi-Fi）

1. 双击 `scripts/serve-lan.bat`（或执行 `npm run serve:lan`）；
2. 电脑和手机连**同一个 Wi-Fi**；
3. 手机浏览器打开控制台打印的地址，形如 `http://192.168.x.x:8080/`；
4. 也可在电脑浏览器打开 `http://192.168.x.x:8080/qr.svg`，用手机摄像头扫码直达。

说明：

- 服务器绑定 `0.0.0.0` 监听局域网，静态资源带 `no-store` 头，手机端不会缓存旧版本；
- 首次启动如弹出 Windows 防火墙提示，请选择「允许访问」（或手动放行 node 的 8080 端口）；
- 端口被占用时换端口：`PORT=9090 node scripts/serve-lan.cjs`；
- 该方式仅限同一局域网；如需**随时随地**访问（不在同一 Wi-Fi），可用内网穿透（如 frp / cpolar / ngrok）或路由器端口转发，转发后手机访问公网地址即可。

## 手机端离线运行（不需要电脑在线、不需要局域网）

项目提供**单文件离线版**：`dist/周行事例批注台-手机版.html`（含全部 CSS、JS 与依赖库，约 2.4MB）。

1. 运行 `node scripts/build-offline.cjs` 生成（产物也在 `dist/index-offline.html`，便于命令行引用）；
2. 把该文件传到手机（微信/QQ 文件传输、邮件附件或 USB 拷贝均可）；
3. 手机打开方式：
   - **Android**：用文件管理器找到该文件 → 选择「浏览器打开」即可使用；或发送到微信后用“浏览器打开”；
   - **iPhone**：微信/QQ 收到后选择“用 Safari 打开”；若 Files 应用无法运行脚本，可用 Documents(Readdle) 等文件浏览器内置浏览器打开；
4. 无需任何服务器与网络，导入/批注/统计全部可用。

> 提示：部分手机在 `file://` 下不允许 localStorage，此时应用会自动降级为内存保存并弹出提示，请及时用「备份」导出 JSON；如需长期保存数据，建议使用下面的 PWA 安装版。

## PWA 安装版（推荐长期使用）

项目已内置 PWA 支持（`manifest.webmanifest` + `sw.js` + 图标），**只需在任何 HTTPS 静态托管**（GitHub Pages、Netlify、Vercel、Cloudflare Pages 等，上传整个文件夹即可）部署一次：

- 手机浏览器打开部署地址 → 菜单「添加到主屏幕」→ 图标即应用本体；
- 首次打开后全部资源被离线缓存，之后**无网络也能用**，数据存在手机本地；
- 后续更新代码后重新部署，重新打开页面即自动更新缓存（页面请求网络优先）。

本项目为纯静态文件、数据不离开手机，部署托管方不会看到你的批注内容。

## 功能总览（FR 映射）

| 需求 | 实现 |
| --- | --- |
| FR-01 导入入口：点击 / 拖拽 | 顶栏「导入周行事例」+ 拖拽区 |
| FR-02 支持 docx / xlsx / xls / csv / txt | SheetJS + PapaParse + mammoth 本地解析；doc 给出「另存为 docx」引导 |
| FR-03 模板约定与别名识别 | 常见列名别名库（日期/星期/起止时间/事项/地点/负责人/备注），docx 优先取表格、无表格按段落解析 |
| FR-04 解析预览与列映射修正 | 预览区表头映射下拉框，改动即重新校验 |
| FR-05 错误行原因与修改重试 | 错误行标红并给出原因，单元格可编辑后自动重新解析，也可跳过导入 |
| FR-06 覆盖 / 合并 | 预览确认时选择导入策略，覆盖前二次确认 |
| FR-07~09 事件生成 / 全天 / 跨天 | 起止时间为空 → 全天条；结束早于开始 → 跨天，起止两天各显示（次日带「跨天续」标记） |
| FR-10 月 / 周 / 日视图 | 顶栏视图切换 |
| FR-11 冲突提示 | 同日时段重叠显示 ⚠ 标记（不阻断生成） |
| FR-12 事件新增 / 编辑 / 删除 | 当日面板操作，删除二次确认；新增/编辑保存后若日期变更，自动跳转到事件日期回显 |
| FR-12a 按月重复记录 | 新增事件可勾选「按月重复」：选星期几并多选月份（支持跨年切换），实时预览该月每周对应日期，一次展开逐日写入 |
| FR-13 事件过多折叠 +N | 月格内最多展示 3 条，其余折叠「+N 更多」 |
| FR-14~18 当日面板与批注 | 点击日期选中/取消；多批注（内容/标签/优先级/创建时间/预留作者），编辑/删除（删除确认）；日历格显示批注数角标并直接展示批注——按优先级 P0→P1→P2→无 排序、每条带优先级标签，独占一行、行首彩色序号（按序号循环配色），事件过多时仅折叠事件、批注始终完整展示；日历右上角图例「本视图批注」统计当前视图范围内的批注（月=当月、周=当周、日=当日），不再显示全局总数造成误解 |
| FR-19 事件与批注分区 | 当日面板「今日事件」「批注」分区 |
| FR-20~23 统计 | 按日/周/月计数（柱/折线）、标签分布、优先级占比、点击柱子下钻当日明细，随批注增删实时更新；统计区间默认跟随日历当前月份，提供「本周 / 本月 / 全部」快捷切换；头部数字与图表均为所选区间口径，下方列出区间批注明细（点击可跳转日历），无数据时提示批注实际分布区间，杜绝“显示总数但图无数据”的歧义 |
| FR-24 统计导出 | CSV 下载 + 图表 PNG 下载 |
| FR-25 本地持久化 | localStorage（万级事件体积约数 MB，满足 5MB 额度；`store.js` 为可替换的数据层，可平滑切 IndexedDB / 后端） |
| FR-26 备份 / 恢复 | 顶栏「备份」导出 JSON、「恢复」导入（覆盖前确认） |
| FR-27 清空全部数据 | 顶栏「清空」，二次确认并提示先备份 |

## 目录结构

```text
zhouxingshili/
├─ index.html                 # 单页入口（经典脚本，无模块 CORS 问题）
├─ css/style.css              # 浅色/深色主题、响应式布局
├─ js/
│  ├─ util/dateutil.js        # 日期/时间/星期解析（纯函数）
│  ├─ util/aliases.js         # 表头别名库与列识别
│  ├─ core/rowparser.js       # 表格行 / 自由文本行 -> Event
│  ├─ core/parser.js          # 解析编排：表头检测、预览结构
│  ├─ core/filereader.js      # xlsx/xls/csv/txt/docx 文件读取
│  ├─ core/stats.js           # 按日/周/月、标签、优先级统计与 CSV
│  ├─ core/store.js           # localStorage 数据层（事件/批注/文件记录 CRUD）
│  └─ ui/                     # calendar / daypanel / importmodal / statspanel / eventform / toast
├─ vendor/                    # 本地化依赖：SheetJS、PapaParse、mammoth、ECharts
├─ samples/                   # 示例文件（见下）
├─ scripts/                   # 示例生成脚本
└─ tests/                     # 单元测试 + Node 冒烟 + 浏览器冒烟
```

## 数据模型（对齐需求 §7）

- `Event`：`id, date, startTime, endTime, allDay, title, location, owner, description, sourceRow`，跨天事件附加 `crossDay/endDate`；
- `Annotation`：`id, date, content, tags, priority(P0/P1/P2), createdAt, author(预留)`；
- `WeeklyFile`：`fileId, fileName, fileType, importTime, totalRows, successRows, failedRows`，写入导入记录；
- `StatResult`：派生数据，不落库，由 `stats.js` 实时计算。

## 模板约定（对齐需求 §5.1.1）

标准表头（列名可任意顺序，识别常见别名）：`日期 / 星期 / 开始时间 / 结束时间 / 事项 / 地点 / 负责人 / 备注`。

- 日期：`2026-08-31`、`2026/8/31`、`8月31日`、`08-31` 等；缺失时按「星期」推断到参考周（参考周取文件内首个日期所在周，否则本周）；
- 时间：`09:00`、`9:30`、`9点30分`、`上午9点`、`下午3点`、`3pm`、`0930`；仅开始时间 → 结束按默认时长（可配置，默认 60 分钟）；
- 结束早于开始 → 跨天事件；无时间 → 全天；
- Word 纯段落（无表格）单行格式：`2026-08-31 周一 09:00-10:30 部门周例会 @3F会议室 负责人:张三`；
- **周历网格模板**：表头形如 `周次 | 周一 | 周二 | … | 周日`，每行为一周、格子内写「日期+事项」（如 `8.31报到`、`5休`、`25中秋假`、`2027.1.1元旦假`）。系统自动识别并逐格推算日期（YYYY.M.D 绝对锚点优先；无锚点时按「格子所在列的星期」多数投票推断年份；缺行按最近已知周顺延），生成全天事件，纯数字格自动跳过；
- `.doc` 旧版二进制浏览器无法直接解析，导入时会提示「另存为 .docx」。

## 示例文件（samples/）

- `sample-weekly.csv` / `sample-weekly.xlsx`：标准表格（含全天、跨天事件）；
- `sample-text-weekly.txt`：自由文本段落格式；
- `sample-weekly.docx`：Word 表格版；`sample-text-weekly.docx`：Word 纯段落版；
- `sample-week-grid.csv`：周历网格模板（周次 × 周一~周日）；
- `sample-with-errors.csv`：含非法日期/非法时间/缺事项行，用于演示错误提示与修正。

重新生成：`node scripts/generate-samples.cjs` 与 `powershell -ExecutionPolicy Bypass -File scripts/generate-docx-samples.ps1`。

## 测试

```bash
npm test                      # 单元测试（日期/别名/行解析/统计/存储，75 项）
node tests/smoke-node.cjs     # Node 冒烟：真实 xlsx/csv/txt 走核心解析管线
```

浏览器端到端（需本机 Edge/Chrome）：

```bash
npm run serve
msedge --headless=new --disable-gpu --no-first-run --virtual-time-budget=10000 --dump-dom http://localhost:8080/tests/browser-smoke.html
```

浏览器冒烟覆盖 23 项断言：月/周/日视图、事件与全天条、批注角标、当日面板 CRUD、统计三图与实时刷新、事件编辑弹窗、备份 JSON、导入弹窗完整链路（拖拽文件 → 解析预览 → 覆盖确认 → 导入记录）。全部通过。

## 设计取舍与扩展点

- **纯前端**：v1.0 无后端，数据只存本地浏览器，符合需求「数据安全」要求；
- **存储**：选用 localStorage 以满足轻量优先；`store.js` 将读写收敛为 `load/save/replace/CRUD`，替换 IndexedDB 或后端 API 只改一个文件；
- **解析**：`filereader.js` 为适配层，替换 SheetJS/mammoth 不影响上层；
- **统计**：`stats.js` 纯函数实时计算（千级批注 <1s），图表仅由 ECharts 渲染，可整体替换；
- **预留**：Annotation.author 字段已建模，后续多角色启用；数据模型版本号 `version` 便于未来迁移。

## 已知边界

- `.doc` 需先另存为 `.docx`（需求文档 §12.1 已列明该风险及应对）；
- 按月重复已支持展开为逐日事件；多设备同步、作者维度统计仍为后续扩展项。重复组统一编辑/删除暂未提供（展开后每条事件独立维护）。
