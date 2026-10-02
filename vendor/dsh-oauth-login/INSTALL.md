# Install dsh-oauth-login

[中文](INSTALL.zh.md). Product pages: [README.md](README.md) (中文), [README.en.md](README.en.md).

## DSH Studio desktop app (recommended)

Open **Settings → Plugins → Add plugin** and enter this in “Package name or address”:

```text
github:aa2246740/dsh-oauth-login#v0.2.7
```

The in-app plugin manager owns the Desktop profile and bundled package manager. This release includes built `lib/`; normal use needs no clone, build, or DSHX installation. Follow the app if it asks you to reload or reopen.

## Web CLI

Stock DeepSeek Harness **0.2.0-rc.2** users install to the Web profile with the official CLI:

```sh
dsh plugin --profile web add github:aa2246740/dsh-oauth-login#v0.2.7
```

If `dsh` is not on PATH:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:aa2246740/dsh-oauth-login#v0.2.7
```

That `github:` spec works because the package declares `dsh.bundle.patch` and
commits built `lib/`. Official add runs pnpm in `$DSH_HOME/profiles/web` and
appends the package to `dsh.profile.bundles`. This command writes only `web`,
not the Desktop App profile. Reopen an already-running Web Host once and reload
the page. You do not need Creator Mode or a second toolchain.

Use `file:` only when editing a local clone. Keep the prefix. A bare
`./dsh-oauth-login` becomes a symlink, while this plugin intentionally resolves
its DSH runtime peer dependencies from the profile; the `file:` install copies
the package into that resolution tree.

```sh
git clone https://github.com/aa2246740/dsh-oauth-login.git
dsh plugin --profile web add file:./dsh-oauth-login
```

Settings → **Subscription Login**. Existing DSH installs keep the old filename as a one-time DSH migration source and never touch Pi Agent auth.

```sh
dsh plugin --profile web exec dsh-oauth-login login openai-codex
dsh plugin --profile web exec dsh-oauth-login login zai-coding-cn
dsh plugin --profile web exec dsh-oauth-login status
dsh plugin --profile web exec dsh-oauth-login logout openai-codex
```

For Zhipu GLM Coding Plan, the command opens the official Plan page and asks
for its API key locally. The plugin never reads your browser session.

After upgrading the server plugin and restarting DSH once, open Settings →
Subscription Login → Network proxy. Configure HTTP and WebSocket independently.
The address defaults to `http://127.0.0.1`, with the port left empty. An enabled
channel with an explicit address and port overrides automatic discovery; an
enabled channel with the default address and no port preserves it without
implicitly selecting port 80; a disabled channel connects
directly. Use an HTTP(S) CONNECT or mixed proxy, not a SOCKS-only port. UI saves
apply to new requests without another restart. Restart DSH when changing the
environment variables inherited at launch. See [details](docs/network-proxy.md).

Uninstall:

```sh
dsh plugin --profile web exec dsh-oauth-login logout
dsh plugin --profile web remove dsh-oauth-login
```
