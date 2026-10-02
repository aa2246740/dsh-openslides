# 安装 dsh-oauth-login

[English](INSTALL.md)。说明和截图在 [README.md](README.md)，英文在 [README.en.md](README.en.md)。

## DSH Studio 桌面 App（推荐）

打开 **设置 → 插件 → 添加插件**，在“包名或地址”中输入：

```text
github:aa2246740/dsh-oauth-login#v0.2.7
```

应用内插件管理器负责 Desktop profile 和内置包管理器。本发布已包含编译好的 `lib/`；普通使用不需要 clone、构建或安装 DSHX。若应用提示刷新或重新打开，请按提示完成。

## Web CLI

官方 DeepSeek Harness **0.2.0-rc.2** 用户用官方 CLI 安装到 Web profile：

```sh
dsh plugin --profile web add github:aa2246740/dsh-oauth-login#v0.2.7
```

没有 `dsh` 时：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:aa2246740/dsh-oauth-login#v0.2.7
```

这条 `github:` 命令能装上，是因为包装了 `dsh.bundle.patch`，并且仓库提交了编好的 `lib/`。官方 add 在 `$DSH_HOME/profiles/web` 里跑 pnpm，再把这个包装进 `dsh.profile.bundles`。这条命令只写 `web` profile，不能修改 Desktop App 的 profile；已运行的 Web Host 需要重新打开一次，再刷新网页。不需要 Creator Mode，也不需要另装一套工具。

本机改源码时再用 `file:`，并且必须保留前缀。直接写 `./dsh-oauth-login` 会变成符号链接；本插件有意从 profile 复用 DSH 运行时的 peer dependency，因此必须使用 `file:` 副本，才能正确解析依赖。

```sh
git clone https://github.com/aa2246740/dsh-oauth-login.git
dsh plugin --profile web add file:./dsh-oauth-login
```

设置 → **订阅登录**。旧版 DSH 文件只作为一次性迁移来源，不会读取或修改 Pi Agent 的登录文件。

```sh
dsh plugin --profile web exec dsh-oauth-login login openai-codex
dsh plugin --profile web exec dsh-oauth-login login zai-coding-cn
dsh plugin --profile web exec dsh-oauth-login status
dsh plugin --profile web exec dsh-oauth-login logout openai-codex
```

智谱 GLM Coding Plan 会打开官方套餐页，再在本机提示你输入 API Key；
插件不会读取你的浏览器登录状态。

升级服务端插件后先重启一次 DSH，再进入「设置 → 订阅登录 → 网络代理」。HTTP 与 WebSocket 可以独立配置，地址默认填入 `http://127.0.0.1`，端口留空。开启并填写端口时优先使用该代理；默认地址且端口留空时沿用自动发现，不会默认使用 80 端口；关闭时直接连接。请使用 HTTP(S) CONNECT / 混合代理端口，不能填纯 SOCKS 端口。页面保存后用于新请求，不需要再次重启；改变启动时继承的环境变量则需要重启。详见[网络代理与恢复机制](docs/network-proxy.md)。

卸载：

```sh
dsh plugin --profile web exec dsh-oauth-login logout
dsh plugin --profile web remove dsh-oauth-login
```
