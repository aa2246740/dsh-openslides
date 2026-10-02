# 在 DSH 0.2.0-rc.2 上安装「演示文稿」（DSH SlideStudio）

把这个仓库跑成 DSH 插件后，「演示文稿」会出现在你的 DSH 里：
装了 dsh-personal（Personal 入口）就在 Personal 侧栏；没装就在主导航出现同名顶层入口。

要求：Node ≥ 22.19，DSH `0.2.0-rc.2`（本仓库 devDependencies 已固定该版本，无需另外安装内核）。

## 0. 桌面快捷安装（推荐）：自包含 tgz 包

正式分发物是一个**自包含插件包** `dsh-personal-slides-0.1.0.tgz`（约 180MB，包含编辑器、运行栈、内置 Chromium 渲染器、skill 资源，安装后零环境变量）。构建：

```sh
cd dsh-personal-slides
node scripts/release.mjs      # 产出 .local/release/dsh-personal-slides-0.1.0.tgz + SHA256SUMS
```

安装（任选其一）：

- **DSH 设置 → 插件 → 添加插件**，填入 tgz 文件的本地路径（桌面端标准流程）。
- 命令行：`dsh plugin --profile web add /path/dsh-personal-slides-0.1.0.tgz`；
  然后在 `profiles/web/cordis.patch.yml` 加一行（桌面安装器会自动合并，命令行需手动）：

  ```yaml
  - insert:
      - id: dsh-personal-slides
        name: dsh-personal-slides
  ```

装完重启 Host → 主导航出现「演示文稿」。已实测：全新 Home 里安装→生成→导出全链路通过。

下面是从源码运行的开发路径。

## 1. 拉代码 + 装依赖

```sh
git clone https://github.com/aa2246740/dsh-openslides.git
cd dsh-openslides                        # 默认分支 main 就是正式版
npm install                              # 只装根目录；workspace 会自动链接 packages/*
```

不需要在 `dsh-personal-slides/` 里再跑 pnpm——根 node_modules 的 workspace 链接会解析
`@open-slidestudio/dsh-slides-host`。已编译产物（`packages/*/dist`、`dsh-personal-slides/lib`）
随分支一起提交，无需构建步骤。

## 2. 安装到正在运行的 Harness

使用当前 profile 的插件管理器安装本仓库的 `dsh-personal-slides` 目录。
它现在声明了 `dsh.bundle`，安装时同时加载服务端和浏览器端。
使用 dshx 时，例如：

```sh
dshx plugin add "$PWD/dsh-personal-slides" --profile desktop --port <当前Host端口>
```

不要再给同一插件额外添加绝对文件路径的 insert patch；只挂载服务端文件不能证明客户端已安装。
已有旧版手工挂载时，先通过插件管理器停用旧入口，保留原配置备份，再检查新入口的实际加载状态。

## 3. 入口与资源

装了 `dsh-personal` 就从 Personal →「演示文稿」进入；没装时会出现独立的「演示文稿」导航入口。
Personal 是可选依赖。两种入口都使用当前 Harness 的模型服务和凭据解析。

资源默认从插件所在仓库查找，不依赖启动目录，也不需要设置 `OPEN_SLIDESTUDIO_ROOT`。

| 环境变量 | 作用 |
| --- | --- |
| `SLIDESTUDIO_SKILL_ROOT` | 可选，覆盖设计资源目录；仓库内有效目录为 `vendor/open-kimi-ppt/skill-1.2.0/skills/open-kimi-ppt` |
| `SLIDES_EDITOR_PORT` | 编辑器 sidecar 端口，可选，默认 56200 |

需要冷启动测试时请使用临时 `DSH_HOME`，不要向正在使用的真实 Home 启动第二个 Host。
安装完成后还需检查当前页面、模型列表、生成和导出；文件安装或 HTTP 200 都不等于功能验收通过。

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
