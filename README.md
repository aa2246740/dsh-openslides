# DSH SlideStudio

[DeepSeek Harness](https://github.com/deepseek-ai/dsh) 的演示文稿插件：一句话描述需求，AI 帮你做出一份可以编辑的 PPT。

**DSH SlideStudio — turn a one-line brief into an editable slide deck, right inside DeepSeek Harness.**

## 功能

- **AI 生成演示文稿**：输入主题和用途，自动完成大纲、排版和逐页渲染，全程可在页面上看到进度
- **画布直接修改**：生成的每一页都能在编辑器里直接改文字、换图片、调样式
- **AI 批注与助手**：选中任何元素写批注，或让 AI 助手继续改写整份稿子
- **导出可编辑文件**：一键导出 PPTX，文本、形状、图表都是原生可编辑对象，PowerPoint / WPS 直接打开继续改
- **中英双语界面**：跟随 DeepSeek Harness 的语言设置自动切换中英文
- **模型统一配置**：使用 DSH 设置页里的模型（GPT、Gemini、智谱 GLM 等），插件不另设模型配置
- **两种入口**：装了 Personal 入口插件时出现在 Personal 侧栏；没装时直接出现在 DSH 主导航

## 安装

正式版本：**0.2.0**，支持 DeepSeek Harness ≥ 0.2.0-rc.2。

从 [Releases](https://github.com/aa2246740/dsh-slidestudio/releases) 下载最新的 `.tgz` 安装包，然后：

- **桌面端**：DSH 侧栏 → **插件 → 添加插件**，填入下载文件的绝对路径
- **命令行**：`dsh plugin --profile web add ./dsh-slidestudio-*.tgz`

安装后在 DSH 设置页接入一个模型，打开「演示文稿 / Slides」输入一句话即可生成。

源码安装（开发模式）见 [INSTALL-DSH.md](INSTALL-DSH.md)。

## 许可

Apache-2.0，见 [LICENSE](LICENSE)。
