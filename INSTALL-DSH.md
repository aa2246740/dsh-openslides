# 在 DSH 0.2.0-rc.2 上安装「演示文稿」（DSH SlideStudio）

把这个仓库跑成 DSH 插件后，「演示文稿」会出现在你的 DSH 里：
装了 dsh-personal（Personal 入口）就在 Personal 侧栏；没装就在主导航出现同名顶层入口。

要求：Node ≥ 22.19，DSH `0.2.0-rc.2`（本仓库 devDependencies 已固定该版本，无需另外安装内核）。

## 1. 拉代码 + 装依赖

```sh
git clone https://github.com/aa2246740/dsh-openslides.git
cd dsh-openslides
git checkout devin/dsh-personal-slides    # 或 Devin 给你的分支名
npm install                              # 只装根目录；workspace 会自动链接 packages/*
```

不需要在 `dsh-personal-slides/` 里再跑 pnpm——根 node_modules 的 workspace 链接会解析
`@open-slidestudio/dsh-slides-host`。已编译产物（`packages/*/dist`、`dsh-personal-slides/lib`）
随分支一起提交，无需构建步骤。

## 2. 配置 patch 文件

```sh
cp scripts/dsh-personal-slides.patch.example.yml my-slides.patch.yml
# 编辑 my-slides.patch.yml：把 /ABS/PATH/... 换成本机绝对路径
# 不用 dsh-personal 的话，删掉第一段（演示文稿会变成主导航顶层入口）
```

## 3. 启动

如果你本机已经在跑 DSH rc2：把 `--patch` 参数和下面三个环境变量加进你现有的启动命令即可。

全新/隔离体验（推荐先这样跑一遍验证）：

```sh
OPEN_SLIDESTUDIO_ROOT=$PWD \
SLIDESTUDIO_SKILL_ROOT=$PWD/vendor/open-kimi-ppt/git-pre-wipe \
SLIDES_EDITOR_PORT=56200 \
./node_modules/.bin/dsh web --patch ./my-slides.patch.yml --port 56337
```

| 环境变量 | 作用 |
| --- | --- |
| `OPEN_SLIDESTUDIO_ROOT` | 本仓库根目录的绝对路径；插件从这里启动编辑器 sidecar、读写 decks |
| `SLIDESTUDIO_SKILL_ROOT` | 生成用的 skill 资源目录（供应商主题/分类参考），指向仓库内 `vendor/open-kimi-ppt/git-pre-wipe` |
| `SLIDES_EDITOR_PORT` | 编辑器 sidecar 端口，可选，默认 56200 |

打开 `http://127.0.0.1:56337` → Personal → 「演示文稿」（或主导航顶层入口）。

## 4. 配模型（走 DSH 官方设置页，插件内没有模型配置页）

设置 → 模型 → 自定义模型 API。例如智谱中国 Coding Plan：

- API 端点：`https://open.bigmodel.cn/api/coding/paas/v4`
- 模型：`glm-5.3`

保存后模型选择器立即可用（内核实时刷新，不用重启）。

## 5. 已验证

- 双入口：装/不装 dsh-personal 都实测通过
- 真实生成：智谱 glm-5.3 端到端跑通（写稿→渲染→审校→可编辑 PPTX 导出）
- 中英双语：跟随 DSH 设置里的 Language，入口名「演示文稿 / Slides」、界面双语
- 回归：28/28 功能特性自动化全绿（Chromium 真实驱动）

细节与限制见 `CLOUD-DELIVERY.md`（§十五生产修复、§十六模型配置统一）。
