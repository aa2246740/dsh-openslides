window.__ModuleLoader__.load({
	id: "dsh-oauth-login",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/draft-input.ts
		function applyDraftChange(providerId, event, setDrafts) {
			const value = event.currentTarget.value;
			setDrafts((current) => ({
				...current,
				[providerId]: value
			}));
		}
		//#endregion
		//#region src/client/OpenRouterSyncStatus.tsx
		const CSS = [
			".dsh-or-sync{display:flex;flex-direction:column;gap:4px;padding:6px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);min-width:0}",
			".dsh-or-sync-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 8px}",
			".dsh-or-sync-copy{min-width:0;overflow-wrap:anywhere}",
			".dsh-or-sync time{font-variant-numeric:tabular-nums}",
			".dsh-or-refresh{min-height:28px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}",
			".dsh-or-refresh:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-or-refresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
			".dsh-or-refresh:disabled{opacity:.55;cursor:default}",
			".dsh-or-sync-error{color:color-mix(in srgb,var(--dsw-alias-state-warn-label) 50%,var(--dsw-alias-label-primary))}"
		].join("\n");
		function OpenRouterSyncStatus({ catalog, ts, details = false }) {
			const state = (0, react.useSyncExternalStore)(catalog.subscribe, catalog.getSnapshot);
			const [now, setNow] = (0, react.useState)(Date.now);
			const data = state.data;
			const retryAt = data?.retryAt ?? 0;
			(0, react.useEffect)(() => {
				setNow(Date.now());
				if (retryAt <= Date.now()) return;
				const timer = setTimeout(() => {
					setNow(Date.now());
				}, retryAt - Date.now() + 20);
				return () => {
					clearTimeout(timer);
				};
			}, [retryAt]);
			const cooling = retryAt > now;
			const working = state.loading || data?.refreshing === true;
			const unavailable = state.error !== null || data?.error !== null && data?.error !== void 0;
			const timestamp = data?.lastUpdatedAt;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-or-sync",
				"data-ud-check": details ? "openrouter-settings-sync" : "openrouter-menu-sync",
				"data-ud-min-gap": "4",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: CSS }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-or-sync-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-or-sync-copy",
							role: "status",
							"aria-live": "polite",
							children: working ? ts("syncing") : data?.connected ? ts("syncSchedule") : ts("syncSignIn")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-or-refresh",
							disabled: working || cooling || data?.connected !== true,
							onClick: () => {
								catalog.load(true);
							},
							children: working ? ts("syncing") : cooling ? ts("syncCooldown") : ts("syncRefresh")
						})]
					}),
					timestamp != null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-or-sync-copy",
						children: [
							ts("syncUpdated"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
								dateTime: new Date(timestamp).toISOString(),
								children: new Date(timestamp).toLocaleString()
							}),
							data?.stale ? " · " + ts("syncStale") : ""
						]
					}),
					timestamp == null && data?.connected && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: ts("syncBuiltin") }),
					unavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						role: "status",
						className: "dsh-or-sync-copy dsh-or-sync-error",
						children: ts(state.error === "restart" ? "syncRestart" : data?.error === "save" ? "syncSaveError" : "syncError")
					}),
					details && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: ts("freeHelp") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: ts("forcedPluginWarning") })] })
				]
			});
		}
		//#endregion
		//#region src/proxy-config.ts
		/** Shared, credential-free settings for this plugin's two outbound transports. */
		const PROXY_SETTINGS_PATH = "/plugins/dsh-oauth-login/network/settings";
		function object(value, keys, label) {
			if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`${label}: invalid settings object`);
			return value;
		}
		function channel(value, label) {
			const raw = object(value, ["enabled", "url"], label);
			if (typeof raw.enabled !== "boolean" || typeof raw.url !== "string" || raw.url.length > 1024) throw new Error(`${label}: expected enabled and proxy URL`);
			const text = raw.url.trim();
			if (text === "") return {
				enabled: raw.enabled,
				url: ""
			};
			let parsed;
			try {
				parsed = new URL(text);
			} catch {
				throw new Error(`${label}: enter a valid HTTP proxy address and port`);
			}
			if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || parsed.port === "0") throw new Error(`${label}: use an HTTP(S) proxy without credentials, path, query or fragment`);
			return {
				enabled: raw.enabled,
				url: parsed.origin
			};
		}
		function parseProxySettings(value) {
			const raw = object(value, [
				"revision",
				"http",
				"websocket"
			], "Network");
			if (typeof raw.revision !== "number" || !Number.isSafeInteger(raw.revision) || raw.revision < 0) throw new Error("Network: invalid revision");
			return {
				revision: raw.revision,
				http: channel(raw.http, "HTTP"),
				websocket: channel(raw.websocket, "WebSocket")
			};
		}
		//#endregion
		//#region src/client/proxy-draft.ts
		const DEFAULT_PROXY_ADDRESS = "http://127.0.0.1";
		function isAutomaticProxyDraft({ address, port }) {
			const host = address.trim().replace(/\/$/, "");
			return port.trim() === "" && (host === "" || host === "http://127.0.0.1" || host === "127.0.0.1");
		}
		function proxyDraft(settings) {
			const channel = ({ enabled, url }) => {
				if (url === "") return {
					enabled,
					address: DEFAULT_PROXY_ADDRESS,
					port: ""
				};
				const parsed = new URL(url);
				return {
					enabled,
					address: `${parsed.protocol}//${parsed.hostname}`,
					port: parsed.port || (parsed.protocol === "https:" ? "443" : "80")
				};
			};
			return {
				http: channel(settings.http),
				websocket: channel(settings.websocket)
			};
		}
		function proxyDraftSettings(draft, revision) {
			const channel = (value) => {
				const { enabled, address, port } = value;
				const host = address.trim();
				const portText = port.trim();
				if (isAutomaticProxyDraft(value)) return {
					enabled,
					url: ""
				};
				if (host === "" || portText !== "" && (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535)) throw new Error("Enter a proxy address and a port from 1 to 65535");
				const parsed = new URL(host.includes("://") ? host : `http://${host}`);
				const pastedPort = /:(\d+)\/?$/.exec(host)?.[1] ?? "";
				if (portText === "" && pastedPort === "") throw new Error("Enter a proxy port from 1 to 65535");
				if (portText !== "") {
					if (pastedPort !== "" && Number(pastedPort) !== Number(portText)) throw new Error("The address and port fields specify different ports");
					parsed.port = portText;
				}
				return {
					enabled,
					url: parsed.href
				};
			};
			return parseProxySettings({
				revision,
				http: channel(draft.http),
				websocket: channel(draft.websocket)
			});
		}
		//#endregion
		//#region src/client/ProxySettings.tsx
		/** Independent of account loading, so a broken network never hides its settings. */
		function ProxySettings({ t }) {
			const id = (0, react.useId)();
			const [settings, setSettings] = (0, react.useState)();
			const [draft, setDraft] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const [saved, setSaved] = (0, react.useState)(false);
			const load = (0, react.useCallback)(async (signal) => {
				setBusy(true);
				setError(void 0);
				setSaved(false);
				try {
					const response = await fetch(PROXY_SETTINGS_PATH, {
						credentials: "same-origin",
						signal
					});
					if (!response.ok) throw new Error("Settings unavailable");
					const value = parseProxySettings(await response.json());
					if (signal?.aborted) return;
					setSettings(value);
					setDraft(proxyDraft(value));
				} catch {
					if (!signal?.aborted) setError("proxyLoadFailed");
				} finally {
					if (!signal?.aborted) setBusy(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				load(controller.signal);
				return () => {
					controller.abort();
				};
			}, [load]);
			const change = (channel, patch) => {
				setDraft((current) => current === void 0 ? current : {
					...current,
					[channel]: {
						...current[channel],
						...patch
					}
				});
				setError(void 0);
				setSaved(false);
			};
			const save = async () => {
				if (draft === void 0 || settings === void 0) return;
				let value;
				try {
					value = proxyDraftSettings(draft, settings.revision);
				} catch {
					setError("proxyInvalid");
					return;
				}
				setBusy(true);
				setError(void 0);
				setSaved(false);
				try {
					const response = await fetch(PROXY_SETTINGS_PATH, {
						method: "POST",
						credentials: "same-origin",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(value)
					});
					if (response.status === 409) {
						setError("proxyConflict");
						return;
					}
					if (!response.ok) throw new Error("Settings save failed");
					const updated = parseProxySettings(await response.json());
					setSettings(updated);
					setDraft(proxyDraft(updated));
					setSaved(true);
				} catch {
					setError("proxySaveFailed");
				} finally {
					setBusy(false);
				}
			};
			const dirty = settings !== void 0 && draft !== void 0 && JSON.stringify(draft) !== JSON.stringify(proxyDraft(settings));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-pi-login-card dsh-oauth-network",
				"aria-labelledby": `${id}-title`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						id: `${id}-title`,
						className: "dsh-pi-login-name",
						children: t("proxyTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-pi-login-body",
						children: t("proxyScope")
					}),
					draft === void 0 && busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-pi-login-body",
						children: t("proxyLoading")
					}) : null,
					draft === void 0 ? null : ["http", "websocket"].map((channel) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
						className: "dsh-oauth-proxy-channel",
						disabled: busy,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", {
								className: "dsh-pi-login-name",
								children: channel === "http" ? "HTTP / HTTPS" : "WebSocket (WS / WSS)"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-oauth-proxy-switch",
								htmlFor: `${id}-${channel}-enabled`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: `${id}-${channel}-enabled`,
									type: "checkbox",
									role: "switch",
									checked: draft[channel].enabled,
									onChange: (event) => change(channel, { enabled: event.currentTarget.checked })
								}), t(channel === "http" ? "proxyHttpEnabled" : "proxyWsEnabled")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-pi-login-body",
								children: t(channel === "http" ? "proxyHttpHelp" : "proxyWsHelp")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-oauth-proxy-fields",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									htmlFor: `${id}-${channel}-address`,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("proxyAddress") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "dsh-pi-login-input",
										id: `${id}-${channel}-address`,
										autoComplete: "off",
										spellCheck: false,
										placeholder: DEFAULT_PROXY_ADDRESS,
										value: draft[channel].address,
										disabled: !draft[channel].enabled,
										onChange: (event) => change(channel, { address: event.currentTarget.value })
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									htmlFor: `${id}-${channel}-port`,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("proxyPort") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "dsh-pi-login-input",
										id: `${id}-${channel}-port`,
										autoComplete: "off",
										inputMode: "numeric",
										placeholder: t("proxyPortPlaceholder"),
										value: draft[channel].port,
										disabled: !draft[channel].enabled,
										onChange: (event) => change(channel, { port: event.currentTarget.value })
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-pi-login-body",
								children: t(!draft[channel].enabled ? "proxyDirect" : isAutomaticProxyDraft(draft[channel]) ? "proxyAuto" : "proxyExplicit")
							})
						]
					}, channel)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-pi-login-body",
						children: t("proxyApplyHelp")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"aria-live": "polite",
						children: [error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-pi-login-error",
							role: "alert",
							children: t(error)
						}), saved ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-pi-login-body",
							children: t("proxySaved")
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-pi-login-row dsh-oauth-proxy-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-pi-login-btn dsh-pi-login-btn-secondary",
							disabled: busy,
							onClick: () => {
								load();
							},
							children: t("proxyReload")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-pi-login-btn dsh-pi-login-btn-primary",
							disabled: busy || !dirty,
							onClick: () => {
								save();
							},
							children: t(busy ? "working" : "proxySave")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/login-input-copy.ts
		const PLAN_COPY = {
			waiting: "waitingForCredential",
			help: "credentialHelp",
			placeholder: "credentialPlaceholder",
			action: "saveCredential",
			required: "credentialRequired"
		};
		const CALLBACK_COPY = {
			waiting: "waitingForCallback",
			help: "callbackHelp",
			placeholder: "callbackPlaceholder",
			action: "submitCallback",
			required: "callbackRequired"
		};
		const AUTH_INPUT_COPY = {
			waiting: "waitingForAuthInput",
			help: "authInputHelp",
			placeholder: "authInputPlaceholder",
			action: "submitAuthInput",
			required: "authInputRequired"
		};
		/** Select visible copy from the provider contract and the actual Pi challenge. */
		function loginInputCopy(authType, challengeType) {
			if (authType === "api_key") return PLAN_COPY;
			if (challengeType === "manual_code") return CALLBACK_COPY;
			return AUTH_INPUT_COPY;
		}
		//#endregion
		//#region src/client/login-window.ts
		/** Deliver a login challenge even when an Electron shell rejects the reserved about:blank popup. */
		function openLoginChallenge(popup, url, openUrl) {
			if (url === void 0) {
				popup?.close();
				return "none";
			}
			if (popup !== null) {
				popup.location.replace(url);
				return "reserved";
			}
			openUrl(url);
			return "fallback";
		}
		//#endregion
		//#region src/client/PiLoginSettings.tsx
		/** Plugin-owned Pi login page inside the dsh Settings shell. */
		const STATUS_PATH = "/plugins/dsh-oauth-login/auth/status";
		const LOGIN_PATH = "/plugins/dsh-oauth-login/auth/login";
		const CANCEL_PATH = "/plugins/dsh-oauth-login/auth/cancel";
		const COMPLETE_PATH = "/plugins/dsh-oauth-login/auth/complete";
		const LOGOUT_PATH = "/plugins/dsh-oauth-login/auth/logout";
		const POLL_INTERVAL_MS = 1e3;
		const STYLE_ID$1 = "dsh-pi-login-settings-theme";
		/**
		* Theme tokens that track light/dark. Hardcoded white/layer fills break dark mode.
		* Mirrors ModelsSection button vocabulary so OAuth cards match the rest of Settings.
		*/
		const SETTINGS_CSS = `
.dsh-pi-login-page { display:flex; flex-direction:column; gap:16px; max-width:640px; color:var(--dsw-alias-label-primary); }
.dsh-pi-login-title { margin:0; font-size:20px; line-height:28px; font-weight:600; color:var(--dsw-alias-label-primary); }
.dsh-pi-login-body { margin:0; font-size:13px; line-height:20px; color:var(--dsw-alias-label-secondary); }
.dsh-pi-login-error { margin:0; font-size:13px; line-height:20px; color:var(--dsw-alias-state-error-primary); }
.dsh-pi-login-stack { display:flex; flex-direction:column; gap:10px; }
.dsh-pi-login-card {
  display:flex; flex-direction:column; gap:8px; padding:14px 16px;
  border:1px solid var(--dsw-alias-border-l2); border-radius:12px;
  background:var(--dsw-alias-bg-module-platform);
}
.dsh-pi-login-row { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
.dsh-pi-login-row-actions { display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.dsh-pi-login-name { margin:0; font-size:15px; font-weight:600; color:var(--dsw-alias-label-primary); }
.dsh-pi-login-status { display:flex; align-items:center; flex-wrap:wrap; gap:6px; font-size:13px; color:var(--dsw-alias-label-secondary); }
.dsh-pi-login-dot { width:8px; height:8px; border-radius:50%; flex:0 0 auto; background:var(--dsw-alias-label-dimmed, #9aa0a6); }
.dsh-pi-login-dot.is-signed-in { background:var(--dsw-alias-state-success-primary, #22a06b); }
.dsh-pi-login-dot.is-error { background:var(--dsw-alias-state-error-primary, #d92d20); }
.dsh-pi-login-dot.is-signing-in { background:var(--dsw-alias-brand-primary, #1677ff); }
.dsh-pi-login-btn {
  box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center;
  min-height:32px; padding:4px 14px; border-radius:16px; font:inherit; font-size:13px; line-height:20px; cursor:pointer;
}
.dsh-pi-login-btn:disabled { opacity:0.55; cursor:not-allowed; }
.dsh-pi-login-btn-secondary {
  border:1px solid var(--dsw-alias-border-l2);
  background:transparent;
  color:var(--dsw-alias-label-primary);
}
.dsh-pi-login-btn-secondary:hover:not(:disabled) {
  background:var(--dsw-alias-interactive-bg-hover);
}
.dsh-pi-login-btn-primary {
  border:none;
  background:var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));
  color:var(--dsw-alias-label-primary-foreground, #fff);
}
.dsh-pi-login-btn-primary:hover:not(:disabled) {
  background:var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary));
}
.dsh-pi-login-code {
  font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size:18px; letter-spacing:0.08em; font-weight:600; color:var(--dsw-alias-label-primary);
}
.dsh-pi-login-link { color:var(--dsw-alias-brand-primary); word-break:break-all; }
.dsh-pi-login-form { display:flex; flex-direction:column; gap:8px; }
.dsh-pi-login-input {
  box-sizing:border-box; width:100%; min-height:36px; padding:7px 10px;
  border:1px solid var(--dsw-alias-border-l2); border-radius:8px;
  background:var(--dsw-alias-bg-page-primary, transparent);
  color:var(--dsw-alias-label-primary); font:inherit; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.dsh-pi-login-input:focus {
  outline:2px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent);
  border-color:var(--dsw-alias-brand-primary);
}
.dsh-pi-login-actions { display:flex; justify-content:flex-end; }
.dsh-oauth-proxy-channel { min-width:0; margin:8px 0 0; padding:12px 0 0; border:0; border-top:1px solid var(--dsw-alias-border-l2); display:flex; flex-direction:column; gap:8px; }
.dsh-oauth-proxy-channel legend { padding:0 8px 0 0; font-size:13px; }
.dsh-oauth-proxy-switch { display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; }
.dsh-oauth-proxy-switch input { width:16px; height:16px; margin:0; accent-color:var(--dsw-alias-brand-primary); }
.dsh-oauth-proxy-fields { display:grid; grid-template-columns:minmax(0, 1fr) 100px; gap:12px; }
.dsh-oauth-proxy-fields label { min-width:0; display:flex; flex-direction:column; gap:6px; font-size:12px; }
.dsh-oauth-proxy-fields input { font-size:13px; }
.dsh-oauth-proxy-fields input:disabled { opacity:0.55; }
.dsh-oauth-proxy-actions { justify-content:flex-end; }
@media (max-width:360px) { .dsh-oauth-proxy-fields { grid-template-columns:minmax(0, 1fr); } }
`;
		function ensureThemeStyles() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ID$1) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID$1;
			style.textContent = SETTINGS_CSS;
			document.head.appendChild(style);
		}
		async function jsonRequest(path, method = "GET", body, signal) {
			const response = await fetch(path, {
				method,
				headers: {
					accept: "application/json",
					...body === void 0 ? {} : { "content-type": "application/json" }
				},
				credentials: "same-origin",
				signal,
				...body === void 0 ? {} : { body: JSON.stringify(body) }
			});
			const value = await response.json().catch(() => void 0);
			if (!response.ok) {
				const message = typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : `HTTP ${response.status}`;
				throw new Error(message);
			}
			return value;
		}
		function PiLoginSettings({ t, ts, catalog }) {
			if (t === void 0) throw new Error("Pi login settings requires its translation function");
			const [providers, setProviders] = (0, react.useState)(void 0);
			const [error, setError] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(void 0);
			const [drafts, setDrafts] = (0, react.useState)({});
			const [challengeUrls, setChallengeUrls] = (0, react.useState)({});
			const [cancellable, setCancellable] = (0, react.useState)({});
			const [cancelling, setCancelling] = (0, react.useState)(void 0);
			const operationSequence = (0, react.useRef)(0);
			const statusSequence = (0, react.useRef)(0);
			const operations = (0, react.useRef)(/* @__PURE__ */ new Map());
			const startOperation = (provider, canCancel, popup) => {
				const previous = operations.current.get(provider);
				previous?.controller.abort();
				previous?.popup?.close();
				const operation = {
					id: ++operationSequence.current,
					controller: new AbortController(),
					...popup === void 0 ? {} : { popup }
				};
				operations.current.set(provider, operation);
				setBusy(provider);
				setCancellable((current) => ({
					...current,
					[provider]: canCancel
				}));
				return operation;
			};
			const isCurrent = (provider, operation) => operations.current.get(provider)?.id === operation.id;
			const finishOperation = (provider, operation) => {
				if (!isCurrent(provider, operation)) return;
				operations.current.delete(provider);
				setBusy(void 0);
				setCancellable((current) => {
					const { [provider]: _removed, ...next } = current;
					return next;
				});
			};
			(0, react.useEffect)(() => {
				ensureThemeStyles();
			}, []);
			const refresh = (0, react.useCallback)(async () => {
				const requestId = ++statusSequence.current;
				try {
					const next = await jsonRequest(STATUS_PATH);
					if (requestId !== statusSequence.current) return;
					setProviders(next);
					catalog?.load();
					setError(void 0);
				} catch (caught) {
					if (requestId !== statusSequence.current) return;
					setError(caught instanceof Error ? caught.message : t("requestFailed"));
				}
			}, [t, catalog]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const signing = providers?.some((provider) => provider.account.status === "signing-in") ?? false;
			(0, react.useEffect)(() => {
				if (!signing) return;
				const timer = window.setInterval(() => {
					refresh();
				}, POLL_INTERVAL_MS);
				return () => {
					window.clearInterval(timer);
				};
			}, [refresh, signing]);
			const signIn = async (id) => {
				const popup = window.open("about:blank", "_blank");
				if (popup !== null) popup.opener = null;
				setChallengeUrls((current) => {
					const { [id]: _removed, ...next } = current;
					return next;
				});
				const operation = startOperation(id, true, popup ?? void 0);
				try {
					const challenge = await jsonRequest(LOGIN_PATH, "POST", { provider: id }, operation.controller.signal);
					if (!isCurrent(id, operation)) return;
					if (challenge.url !== void 0) setChallengeUrls((current) => ({
						...current,
						[id]: challenge.url
					}));
					openLoginChallenge(popup, challenge.url, (url) => {
						window.open(url, "_blank", "noopener,noreferrer");
					});
					await refresh();
				} catch (caught) {
					popup?.close();
					if (isCurrent(id, operation) && !operation.controller.signal.aborted) setError(caught instanceof Error ? caught.message : t("requestFailed"));
				} finally {
					finishOperation(id, operation);
				}
			};
			const submitInput = async (provider) => {
				const value = drafts[provider.id]?.trim() ?? "";
				if (value.length === 0) {
					const challenge = provider.account.status === "signing-in" ? provider.account.input : void 0;
					setError(t(challenge === void 0 ? "authInputRequired" : loginInputCopy(provider.authType, challenge.type).required));
					return;
				}
				const operation = startOperation(provider.id, true);
				try {
					await jsonRequest(COMPLETE_PATH, "POST", {
						provider: provider.id,
						value
					}, operation.controller.signal);
					if (!isCurrent(provider.id, operation)) return;
					setChallengeUrls((current) => {
						const { [provider.id]: _removed, ...next } = current;
						return next;
					});
					setDrafts((current) => {
						const { [provider.id]: _removed, ...next } = current;
						return next;
					});
					await refresh();
				} catch (caught) {
					if (isCurrent(provider.id, operation) && !operation.controller.signal.aborted) setError(caught instanceof Error ? caught.message : t("requestFailed"));
				} finally {
					finishOperation(provider.id, operation);
				}
			};
			const cancelSignIn = async (id) => {
				const operation = startOperation(id, false);
				setCancelling(id);
				try {
					await jsonRequest(CANCEL_PATH, "POST", { provider: id }, operation.controller.signal);
					if (!isCurrent(id, operation)) return;
					setChallengeUrls((current) => {
						const { [id]: _removed, ...next } = current;
						return next;
					});
					setDrafts((current) => {
						const { [id]: _removed, ...next } = current;
						return next;
					});
					await refresh();
				} catch (caught) {
					if (isCurrent(id, operation) && !operation.controller.signal.aborted) setError(caught instanceof Error ? caught.message : t("requestFailed"));
				} finally {
					if (isCurrent(id, operation)) setCancelling(void 0);
					finishOperation(id, operation);
				}
			};
			const reopenSignIn = (url) => {
				openLoginChallenge(null, url, (next) => {
					window.open(next, "_blank", "noopener,noreferrer");
				});
			};
			const signOut = async (id) => {
				setBusy(id);
				try {
					await jsonRequest(LOGOUT_PATH, "POST", { provider: id });
					setChallengeUrls((current) => {
						const { [id]: _removed, ...next } = current;
						return next;
					});
					await refresh();
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : t("requestFailed"));
				} finally {
					setBusy(void 0);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-pi-login-page",
				"aria-labelledby": "pi-login-settings-title",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						id: "pi-login-settings-title",
						className: "dsh-pi-login-title",
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProxySettings, { t }),
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-pi-login-error",
						children: error
					}) : null,
					providers === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-pi-login-body",
						children: t("loadingAccount")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-pi-login-stack",
						children: providers.map((provider) => {
							const account = provider.account;
							const inputCopy = account.status === "signing-in" && account.input !== void 0 ? loginInputCopy(provider.authType, account.input.type) : void 0;
							const challengeUrl = account.status === "signing-in" ? account.url ?? challengeUrls[provider.id] : void 0;
							const label = account.status === "signed-in" ? t("signedIn") : account.status === "signing-in" ? inputCopy === void 0 ? t("signingIn") : t(inputCopy.waiting) : account.status === "error" ? t("requestFailed") : t("signedOut");
							const dotClass = account.status === "signed-in" ? "dsh-pi-login-dot is-signed-in" : account.status === "error" ? "dsh-pi-login-dot is-error" : account.status === "signing-in" ? "dsh-pi-login-dot is-signing-in" : "dsh-pi-login-dot";
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: "dsh-pi-login-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-pi-login-row",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "dsh-pi-login-name",
											children: provider.displayName
										}), account.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dsh-pi-login-btn dsh-pi-login-btn-secondary",
											disabled: busy !== void 0,
											onClick: () => {
												signOut(provider.id);
											},
											children: busy === provider.id ? t("working") : t("logout")
										}) : account.status === "signing-in" || cancellable[provider.id] === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "dsh-pi-login-row-actions",
											children: [challengeUrl !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "dsh-pi-login-btn dsh-pi-login-btn-primary",
												disabled: busy !== void 0,
												onClick: () => {
													reopenSignIn(challengeUrl);
												},
												children: t("reopenAuthorization")
											}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "dsh-pi-login-btn dsh-pi-login-btn-secondary",
												disabled: cancelling === provider.id || busy !== void 0 && busy !== provider.id,
												onClick: () => {
													cancelSignIn(provider.id);
												},
												children: cancelling === provider.id ? t("working") : t("cancelLogin")
											})]
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dsh-pi-login-btn dsh-pi-login-btn-primary",
											disabled: busy !== void 0,
											onClick: () => {
												signIn(provider.id);
											},
											children: busy === provider.id ? t("working") : account.status === "error" ? t("loginAgain") : provider.authType === "api_key" ? t("connectPlan") : t("login")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsh-pi-login-status",
										role: "status",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											className: dotClass
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
									}),
									provider.id === "openrouter" && catalog !== void 0 && ts !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenRouterSyncStatus, {
										catalog,
										ts,
										details: true
									}),
									account.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "dsh-pi-login-error",
										children: account.message
									}) : null,
									account.status === "signing-in" && account.userCode !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "dsh-pi-login-body",
										children: [
											t("userCode"),
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-pi-login-code",
												children: account.userCode
											})
										]
									}) : null,
									account.status === "signing-in" && challengeUrl !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "dsh-pi-login-body",
										children: [
											provider.authType === "api_key" && account.input !== void 0 ? t("openPlanPage") : t("openUrl"),
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
												href: challengeUrl,
												target: "_blank",
												rel: "noreferrer",
												className: "dsh-pi-login-link",
												children: challengeUrl
											})
										]
									}) : null,
									account.status === "signing-in" && account.input !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
										className: "dsh-pi-login-form",
										onSubmit: (event) => {
											event.preventDefault();
											submitInput(provider);
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: "dsh-pi-login-body",
												children: t(inputCopy?.help ?? "authInputHelp")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: account.input.type === "secret" ? "password" : "text",
												className: "dsh-pi-login-input",
												"aria-label": account.input.message,
												autoComplete: "off",
												spellCheck: false,
												placeholder: t(inputCopy?.placeholder ?? "authInputPlaceholder"),
												value: drafts[provider.id] ?? "",
												disabled: busy !== void 0,
												onChange: (event) => {
													applyDraftChange(provider.id, event, setDrafts);
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dsh-pi-login-actions",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "submit",
													className: "dsh-pi-login-btn dsh-pi-login-btn-primary",
													disabled: busy !== void 0 || (drafts[provider.id]?.trim().length ?? 0) === 0,
													children: busy === provider.id ? t("working") : t(inputCopy?.action ?? "submitAuthInput")
												})
											})
										]
									}) : null
								]
							}, provider.id);
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/model-filter.ts
		/**
		* Case-insensitive substring filter over model name, model id, and provider
		* name. Blank queries return the input unchanged (same array identity).
		* Groups whose every model is filtered out disappear; relative order holds.
		* @param groups - provider groups from the shared directory snapshot.
		* @param query - raw user text; trimmed and lowercased here.
		* @returns the filtered groups.
		*/
		function filterGroups(groups, query, freeModels) {
			const q = query.trim().toLowerCase();
			if (q === "" && freeModels === void 0) return groups;
			const out = [];
			for (const group of groups) {
				if (freeModels !== void 0 && group.id !== "pi-openrouter") continue;
				const matches = group.name.toLowerCase().includes(q) ? group.models : group.models.filter((model) => model.name.toLowerCase().includes(q) || model.id.toLowerCase().includes(q));
				const models = freeModels === void 0 ? matches : matches.filter((model) => freeModels.has(model.id));
				if (models.length > 0) out.push({
					...group,
					models
				});
			}
			return out;
		}
		//#endregion
		//#region src/openrouter-types.ts
		/** Browser-safe contract. No credentials, provider URLs or server imports. */
		const OPENROUTER_CATALOG_PATH = "/plugins/dsh-oauth-login/openrouter/models";
		const OPENROUTER_REFRESH_PATH = "/plugins/dsh-oauth-login/openrouter/models/refresh";
		//#endregion
		//#region src/client/SearchableModelSelect.tsx
		/**
		* SearchableModelSelect: plugin-owned shadow of the composer model seat
		* (`conversation.input.model`, registered at priority -1 so it renders over
		* the shipped ModelSelect). Behavior mirrors the official two-level menu —
		* root rows drill into the model list and the effort list over the SAME
		* shared per-session directory — and adds one thing the shipped seat lacks:
		* a local search box on the model pane that filters provider groups by model
		* name/id or provider name while typing. Selection still submits through the
		* injected `select` face, so the host stays the single fact source.
		*/
		const STYLE_ID = "dsh-oauth-model-search-theme";
		/** Theme-token styles mirroring the shipped seat's menu vocabulary. */
		const SEARCH_CSS = `
.dsh-oauth-ms-root { position:relative; min-width:0; }
.dsh-oauth-ms-trigger {
  display:flex; align-items:center; gap:4px; min-width:0;
  max-width:min(360px,45cqw); height:28px; padding:0 4px 0 8px;
  border:none; border-radius:24px; outline:none; background:transparent;
  color:var(--dsw-alias-label-secondary); font-size:13px; line-height:20px;
  font-weight:500; cursor:pointer;
}
.dsh-oauth-ms-trigger:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-oauth-ms-trigger:focus-visible { box-shadow:0 0 0 2px var(--dsw-alias-border-l3); }
.dsh-oauth-ms-trigger:disabled { color:var(--dsw-alias-label-dimmed); cursor:default; }
.dsh-oauth-ms-triggerLabel { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dsh-oauth-ms-triggerEffort { flex:0 0 auto; color:var(--dsw-alias-label-caption); }
.dsh-oauth-ms-chevron { flex:0 0 auto; color:var(--dsw-alias-label-caption); transition:transform 120ms ease; }
.dsh-oauth-ms-chevronOpen { transform:rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .dsh-oauth-ms-chevron { transition:none; } }
.dsh-oauth-ms-menu {
  position:absolute; right:0; bottom:calc(100% + 8px); z-index:20;
  display:flex; flex-direction:column;
  width:max-content; min-width:min(240px,calc(100vw - 32px));
  max-width:min(420px,calc(100vw - 32px));
  max-height:min(360px,calc(100vh - 96px)); overflow:hidden; padding:4px;
  border:1px solid var(--dsw-alias-border-inverted); border-radius:12px;
  background:var(--dsw-specific-menu); box-shadow:var(--dsw-shadow-lv3);
  color:var(--dsw-alias-label-primary);
  --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);
}
.dsh-oauth-ms-status,.dsh-oauth-ms-empty { padding:10px; color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:20px; }
.dsh-oauth-ms-errorStrip {
  display:flex; align-items:flex-start; justify-content:space-between; gap:8px;
  margin-bottom:4px; padding:7px 8px; border-radius:8px;
  background:var(--dsw-alias-interactive-bg-hover-danger);
  color:var(--dsw-alias-state-error-primary); font-size:12px; line-height:18px;
}
.dsh-oauth-ms-warning {
  display:flex; align-items:flex-start; justify-content:space-between; gap:8px;
  margin-bottom:4px; padding:7px 8px; border-radius:8px;
  background:var(--dsw-alias-bg-module-platform);
  color:var(--dsw-alias-state-warn-label); font-size:12px; line-height:18px;
}
.dsh-oauth-ms-retry { flex:0 0 auto; padding:0; border:none; background:transparent; color:inherit; font:inherit; font-weight:600; cursor:pointer; }
.dsh-oauth-ms-search {
  margin:2px 2px 4px; padding:6px 8px; border:1px solid var(--dsw-alias-border-inverted);
  border-radius:8px; background:transparent; font-size:13px;
  color:var(--dsw-alias-label-primary); outline:none;
}
.dsh-oauth-ms-search:focus-visible { box-shadow:0 0 0 2px var(--dsw-alias-border-l3); }
.dsh-oauth-ms-groups { min-height:0; overflow-y:auto; }
.dsh-oauth-ms-group + .dsh-oauth-ms-group { margin-top:4px; }
.dsh-oauth-ms-groupTitle {
  position:sticky; top:0; z-index:1; padding:5px 8px 3px;
  background:var(--dsw-specific-menu); color:var(--dsw-alias-label-tertiary);
  font-size:12px; line-height:18px; font-weight:500;
}
.dsh-oauth-ms-option {
  box-sizing:border-box; display:flex; align-items:center; gap:8px;
  width:auto; min-width:100%; min-height:38px; padding:6px 8px;
  border:none; border-radius:10px; outline:none; background:transparent;
  color:inherit; text-align:left; cursor:pointer;
}
.dsh-oauth-ms-option:hover:not(:disabled),.dsh-oauth-ms-option:focus-visible { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-oauth-ms-option:disabled { color:var(--dsw-alias-label-dimmed); cursor:default; }
.dsh-oauth-ms-optionCopy { display:flex; flex:1; flex-direction:column; min-width:0; }
.dsh-oauth-ms-modelName { overflow:hidden; color:inherit; font-size:14px; line-height:20px; font-weight:500; text-overflow:ellipsis; white-space:nowrap; }
.dsh-oauth-ms-description { overflow:hidden; color:var(--dsw-alias-label-tertiary); font-size:12px; line-height:18px; text-overflow:ellipsis; white-space:nowrap; }
.dsh-oauth-ms-check { display:grid; place-items:center; flex:0 0 18px; color:var(--dsw-alias-label-primary); }
.dsh-oauth-ms-cell {
  box-sizing:border-box; display:flex; align-items:center; gap:8px;
  width:auto; min-width:100%; height:40px; padding:0 10px;
  border:none; border-radius:10px; background:transparent;
  color:var(--dsw-alias-label-primary); font-size:14px; line-height:22px;
  cursor:pointer; text-align:left;
}
.dsh-oauth-ms-cell:hover { background:var(--dsw-alias-interactive-bg-hover); }
.dsh-oauth-ms-cellLabel { flex:0 0 auto; white-space:nowrap; }
.dsh-oauth-ms-cellValue { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; color:var(--dsw-alias-label-tertiary); }
.dsh-oauth-ms-cellChevron { flex:0 0 auto; color:var(--dsw-alias-label-tertiary); }
.dsh-oauth-ms-filters { display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:2px 4px 4px; }
.dsh-oauth-ms-filter { min-height:28px;padding:3px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer; }
.dsh-oauth-ms-filter[aria-pressed="true"] { background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3); }
.dsh-oauth-ms-filter:focus-visible { outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px; }
.dsh-oauth-ms-meta { display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin-top:3px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px; }
.dsh-oauth-ms-free { padding:1px 6px;border-radius:4px;color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 50%,var(--dsw-alias-label-primary));background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent); }
.dsh-oauth-ms-cached { color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover); }
.dsh-oauth-ms-ended { color:color-mix(in srgb,var(--dsw-alias-state-warn-label) 50%,var(--dsw-alias-label-primary));white-space:normal; }
.dsh-oauth-ms-help { padding:4px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:normal; }
@media (max-width:480px) { .dsh-oauth-ms-menu { width:calc(100vw - 32px);max-height:min(520px,calc(100dvh - 120px)); } .dsh-oauth-ms-option { min-height:44px; } }
`;
		function ensureStyles() {
			if (typeof document === "undefined") return;
			const existing = document.getElementById(STYLE_ID);
			if (existing !== null) {
				existing.textContent = SEARCH_CSS;
				return;
			}
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = SEARCH_CSS;
			document.head.appendChild(style);
		}
		/** Small inline chevron-down glyph (avoids importing host primitives). */
		function Chevron({ className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className,
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4 6l4 4 4-4",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		/** Small inline chevron-right glyph. */
		function ChevronRight({ className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className,
				width: "14",
				height: "14",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M6 4l4 4-4 4",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		/**
		* Render the searchable composer model seat.
		* @param props - see {@link SearchableModelSelectProps}.
		* @returns the trigger and, while open, the search-enabled two-level menu.
		*/
		function SearchableModelSelect({ locked, available, directory, catalog, load, select, t, ts }) {
			const state = (0, react.useSyncExternalStore)((fn) => directory.subscribe(fn), () => directory.getSnapshot());
			const catalogState = (0, react.useSyncExternalStore)(catalog.subscribe, catalog.getSnapshot);
			const metadata = (0, react.useMemo)(() => new Map(catalogState.data?.models.map((model) => [model.id, model]) ?? []), [catalogState.data]);
			const freeModels = (0, react.useMemo)(() => new Set([...metadata.values()].filter((model) => model.priceStatus === "free").map((model) => model.id)), [metadata]);
			const [freeOnly, setFreeOnly] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const [query, setQuery] = (0, react.useState)("");
			const lastActionRef = (0, react.useRef)("load");
			const [notice, setNotice] = (0, react.useState)(null);
			const noticeSeq = (0, react.useRef)(0);
			const noticeTimer = (0, react.useRef)(void 0);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const searchRef = (0, react.useRef)(null);
			const itemRefs = (0, react.useRef)([]);
			const id = (0, react.useId)();
			(0, react.useEffect)(() => {
				ensureStyles();
			}, []);
			(0, react.useEffect)(() => {
				if (open && pane === "model") searchRef.current?.focus();
			}, [open, pane]);
			(0, react.useEffect)(() => {
				if (catalogState.data?.connected === false) setFreeOnly(false);
			}, [catalogState.data?.connected]);
			(0, react.useEffect)(() => {
				if (available && catalogState.data?.lastUpdatedAt != null) load();
			}, [
				available,
				catalogState.data?.lastUpdatedAt,
				load
			]);
			(0, react.useEffect)(() => () => {
				window.clearTimeout(noticeTimer.current);
			}, []);
			const choices = (0, react.useMemo)(() => state.groups.flatMap((group) => group.models.map((model) => ({
				group,
				model,
				selection: {
					provider: group.id,
					model: model.id,
					...model.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort }
				}
			}))), [state.groups]);
			const current = state.current;
			const currentChoice = choices[current === null ? -1 : choices.findIndex((c) => c.selection.provider === current.provider && c.selection.model === current.model)];
			const reasoning = currentChoice?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("effort.providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => reasoning === void 0 ? [] : [...reasoning.defaultEffort === void 0 ? [{
				key: "provider-default",
				effort: void 0,
				label: t("effort.providerDefault")
			}] : [], ...reasoning.efforts.map((effort) => ({
				key: `effort:${effort.id}`,
				effort: effort.id,
				label: effort.name,
				...effort.description === void 0 ? {} : { description: effort.description }
			}))], [reasoning, t]);
			const busy = state.status === "selecting";
			const filteredGroups = (0, react.useMemo)(() => filterGroups(state.groups, query, freeOnly ? freeModels : void 0), [
				state.groups,
				query,
				freeOnly,
				freeModels
			]);
			const filteredCount = (0, react.useMemo)(() => filteredGroups.reduce((sum, group) => sum + group.models.length, 0), [filteredGroups]);
			const reload = () => {
				lastActionRef.current = "load";
				load();
				catalog.load();
			};
			(0, react.useEffect)(() => {
				if (available) {
					lastActionRef.current = "load";
					load();
				}
			}, [available, load]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			if (!available) return null;
			const show = () => {
				setPane("root");
				setQuery("");
				setNotice(null);
				setOpen(true);
				reload();
			};
			const close = (restoreFocus = false) => {
				setOpen(false);
				setPane("root");
				setQuery("");
				if (restoreFocus) queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			const moveFocus = (offset) => {
				const items = itemRefs.current.filter((item) => item !== null && !item.disabled);
				if (items.length === 0) return;
				const active = items.findIndex((item) => item === document.activeElement);
				items[(Math.max(active, 0) + offset + items.length) % items.length]?.focus();
			};
			const onRootKeyDown = (event) => {
				if (event.key === "Escape" && open) {
					event.preventDefault();
					if (pane !== "root") setPane("root");
					else close(true);
					return;
				}
				if (!open) return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					moveFocus(event.key === "ArrowDown" ? 1 : -1);
				}
			};
			const onBlur = (event) => {
				if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
				close();
			};
			const settleSelection = (result) => {
				if (result === void 0) return;
				if (result.ok) {
					if (rootRef.current !== null) close(true);
					return;
				}
				const { error } = result;
				noticeSeq.current += 1;
				window.clearTimeout(noticeTimer.current);
				setNotice({
					seq: noticeSeq.current,
					text: error.code === "session/writer-held" ? t("error.sessionInUse") : t("error.action", { message: `${error.code}: ${error.message}` })
				});
				noticeTimer.current = window.setTimeout(() => {
					setNotice(null);
				}, 4e3);
			};
			const choose = (selection) => {
				const info = selection.provider === "pi-openrouter" ? metadata.get(selection.model) : void 0;
				if (info?.freeOnly && info.priceStatus !== "free") return;
				const current = state.current;
				if (current?.provider === selection.provider && current.model === selection.model) {
					close(true);
					return;
				}
				lastActionRef.current = "select";
				select(selection).then(settleSelection);
			};
			const chooseEffort = (effort) => {
				if (state.current === null) return;
				if (effectiveEffort === effort) {
					close(true);
					return;
				}
				const selection = {
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				};
				lastActionRef.current = "select";
				select(selection).then(settleSelection);
			};
			/** Search-input keyboard: ↓ enters the list, Enter picks the first match, Escape clears then backs out. */
			const onSearchKeyDown = (event) => {
				if (event.key === "ArrowDown") {
					event.preventDefault();
					event.stopPropagation();
					itemRefs.current.find((item) => item !== null)?.focus();
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					const first = filteredGroups[0]?.models[0];
					if (first !== void 0) choose({
						provider: filteredGroups[0].id,
						model: first.id
					});
					return;
				}
				if (event.key === "Escape") {
					event.stopPropagation();
					if (query !== "") setQuery("");
				}
			};
			const modelLabel = currentChoice?.model.name ?? state.current?.model ?? t("trigger.fallback");
			const triggerLabel = effortLabel === void 0 ? modelLabel : `${modelLabel} · ${effortLabel}`;
			const triggerAria = currentChoice === void 0 ? t("trigger.selectAria") : effortLabel === void 0 ? t("trigger.aria", { model: modelLabel }) : t("trigger.ariaEffort", {
				model: modelLabel,
				effort: effortLabel
			});
			itemRefs.current = [];
			let itemIndex = 0;
			const itemRef = () => {
				const at = itemIndex++;
				return (node) => {
					itemRefs.current[at] = node;
				};
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "dsh-oauth-ms-root",
				onKeyDown: onRootKeyDown,
				onBlur,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: "dsh-oauth-ms-trigger",
					"aria-label": triggerAria,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					"aria-controls": open ? `${id}-menu` : void 0,
					title: triggerLabel,
					disabled: locked,
					onClick: () => {
						if (open) close();
						else show();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-oauth-ms-triggerLabel",
							children: modelLabel
						}),
						effortLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-oauth-ms-triggerEffort",
							children: effortLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, { className: `dsh-oauth-ms-chevron${open ? " dsh-oauth-ms-chevronOpen" : ""}` })
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					id: `${id}-menu`,
					className: "dsh-oauth-ms-menu",
					role: "menu",
					"aria-label": t("menu.aria"),
					"aria-busy": state.status === "loading" || busy,
					children: [
						pane === "root" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: itemRef(),
							type: "button",
							role: "menuitem",
							className: "dsh-oauth-ms-cell",
							onClick: () => {
								setPane("model");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-oauth-ms-cellLabel",
									children: t("menu.model")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-oauth-ms-cellValue",
									children: modelLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronRight, { className: "dsh-oauth-ms-cellChevron" })
							]
						}), reasoning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: itemRef(),
							type: "button",
							role: "menuitem",
							className: "dsh-oauth-ms-cell",
							onClick: () => {
								setPane("effort");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-oauth-ms-cellLabel",
									children: t("menu.effort")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-oauth-ms-cellValue",
									children: effortLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronRight, { className: "dsh-oauth-ms-cellChevron" })
							]
						})] }),
						pane === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: searchRef,
								type: "text",
								className: "dsh-oauth-ms-search",
								placeholder: ts("placeholder"),
								"aria-label": ts("aria"),
								value: query,
								autoComplete: "off",
								spellCheck: false,
								onChange: (event) => {
									setQuery(event.target.value);
								},
								onKeyDown: onSearchKeyDown
							}),
							(catalogState.data?.connected || state.groups.some((group) => group.id === "pi-openrouter")) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-oauth-ms-filters",
								role: "group",
								"aria-label": ts("freeFilterAria"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-oauth-ms-filter",
									"aria-pressed": !freeOnly,
									onClick: () => {
										setFreeOnly(false);
									},
									children: ts("all")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "dsh-oauth-ms-filter",
									"aria-pressed": freeOnly,
									onClick: () => {
										setFreeOnly(true);
									},
									children: [
										ts("freeOnly"),
										" · ",
										freeModels.size
									]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenRouterSyncStatus, {
								catalog,
								ts
							})] }),
							state.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-oauth-ms-status",
								children: t("status.loading")
							}),
							state.error !== null && lastActionRef.current === "load" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-oauth-ms-errorStrip",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-oauth-ms-retry",
									onClick: reload,
									children: t("retry")
								})]
							}),
							state.failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsh-oauth-ms-warning",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("warning.groupLoad", {
									name: failure.name,
									message: failure.message
								}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-oauth-ms-retry",
									onClick: reload,
									children: t("retry")
								})]
							}, failure.id)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-oauth-ms-groups",
								children: filteredGroups.map((group) => {
									const headingId = `${id}-${group.id}`;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										role: "group",
										"aria-labelledby": headingId,
										className: "dsh-oauth-ms-group",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "dsh-oauth-ms-groupTitle",
											id: headingId,
											children: group.name
										}), group.models.map((model) => {
											const selected = state.current?.provider === group.id && state.current.model === model.id;
											const info = group.id === "pi-openrouter" ? metadata.get(model.id) : void 0;
											const blocked = info?.freeOnly === true && info.priceStatus !== "free";
											const tokens = info === void 0 ? "" : new Intl.NumberFormat(void 0, {
												notation: "compact",
												maximumFractionDigits: 1
											}).format(info.contextWindow);
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												ref: itemRef(),
												type: "button",
												role: "menuitemradio",
												"aria-checked": selected,
												className: "dsh-oauth-ms-option",
												title: model.name,
												disabled: busy || blocked,
												onClick: () => {
													choose({
														provider: group.id,
														model: model.id
													});
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: "dsh-oauth-ms-optionCopy",
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "dsh-oauth-ms-modelName",
															children: model.name
														}),
														model.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "dsh-oauth-ms-description",
															children: model.description
														}),
														info !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															className: "dsh-oauth-ms-meta",
															children: [
																info.priceStatus === "free" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: "dsh-oauth-ms-free" + (catalogState.data?.stale ? " dsh-oauth-ms-cached" : ""),
																	children: ts(catalogState.data?.stale ? "freeCached" : "free")
																}),
																blocked && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: "dsh-oauth-ms-ended",
																	children: ts(info.priceStatus === "paid" ? "freeEnded" : "freeUnknown")
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: ts(info.tools ? "tools" : "chatOnly") }),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: ts("context", { tokens }) })
															]
														})
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dsh-oauth-ms-check",
													children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
														width: "16",
														height: "16",
														viewBox: "0 0 16 16",
														fill: "none",
														"aria-hidden": "true",
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
															d: "M3 8.5l3.2 3L13 5",
															stroke: "currentColor",
															strokeWidth: "1.5",
															strokeLinecap: "round",
															strokeLinejoin: "round"
														})
													}) : null
												})]
											}, model.id);
										})]
									}, group.id);
								})
							}),
							state.status === "ready" && state.groups.length > 0 && filteredCount === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-oauth-ms-empty",
								children: freeOnly ? ts("emptyFree") : ts("empty", { query: query.trim() })
							}),
							state.status === "ready" && state.groups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-oauth-ms-empty",
								children: t("empty.models")
							}),
							freeOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-oauth-ms-help",
								children: ts("freeHelp")
							})
						] }),
						pane === "effort" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [state.error !== null && lastActionRef.current === "load" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-oauth-ms-errorStrip",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-oauth-ms-retry",
								onClick: reload,
								children: t("action.reload")
							})]
						}), effortChoices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-oauth-ms-empty",
							children: t("empty.efforts")
						}) : effortChoices.map((level) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: itemRef(),
							type: "button",
							role: "menuitemradio",
							"aria-checked": effectiveEffort === level.effort,
							className: "dsh-oauth-ms-option",
							disabled: busy,
							onClick: () => {
								chooseEffort(level.effort);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-oauth-ms-optionCopy",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-oauth-ms-modelName",
									children: level.label
								}), level.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-oauth-ms-description",
									children: level.description
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-oauth-ms-check",
								children: effectiveEffort === level.effort ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
									width: "16",
									height: "16",
									viewBox: "0 0 16 16",
									fill: "none",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
										d: "M3 8.5l3.2 3L13 5",
										stroke: "currentColor",
										strokeWidth: "1.5",
										strokeLinecap: "round",
										strokeLinejoin: "round"
									})
								}) : null
							})]
						}, level.key))] }),
						notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "alert",
							className: "dsh-oauth-ms-errorStrip",
							children: notice.text
						}, notice.seq)
					]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const en = {
			nav: "Subscription Login",
			title: "Subscription Login",
			loadingAccount: "Loading accounts…",
			signedOut: "Not signed in",
			signingIn: "Waiting for authorization…",
			waitingForCredential: "Waiting for a Plan API key…",
			waitingForCallback: "Waiting for the authorization callback…",
			waitingForAuthInput: "Waiting for authorization details…",
			signedIn: "Signed in",
			login: "Sign in",
			connectPlan: "Connect plan",
			loginAgain: "Sign in again",
			reopenAuthorization: "Reopen authorization",
			cancelLogin: "Cancel",
			logout: "Sign out",
			working: "Working…",
			userCode: "Code",
			openUrl: "Authorize",
			openPlanPage: "Plan page",
			credentialHelp: "Create or copy the provider-specific Plan API key, then paste it here. It stays in DSH’s private credential file.",
			credentialPlaceholder: "Paste Plan API key",
			saveCredential: "Save and connect",
			credentialRequired: "Paste the Plan API key first.",
			callbackHelp: "Paste the complete callback URL from the browser after authorization. DSH uses it only to finish this sign-in.",
			callbackPlaceholder: "Paste the callback URL",
			submitCallback: "Complete sign-in",
			callbackRequired: "Paste the callback URL first.",
			authInputHelp: "Enter the value requested by the provider to continue authorization.",
			authInputPlaceholder: "Enter authorization value",
			submitAuthInput: "Continue",
			authInputRequired: "Enter the requested authorization value first.",
			requestFailed: "The login request failed.",
			proxyTitle: "Network proxy",
			proxyScope: "Only applies to requests made by this subscription plugin. Does not change your system or browser proxy.",
			proxyLoading: "Loading network settings…",
			proxyHttpEnabled: "Use a proxy for HTTP",
			proxyWsEnabled: "Use a proxy for WebSocket",
			proxyHttpHelp: "Login, token refresh, model requests over HTTPS / SSE, and model catalogs.",
			proxyWsHelp: "Model WebSocket connections. This switch controls proxy routing; it does not disable WebSocket itself.",
			proxyAddress: "Proxy address (HTTP / HTTPS)",
			proxyPort: "Port",
			proxyPortPlaceholder: "e.g. 45678",
			proxyDirect: "Off: connect directly, ignoring proxy environment variables. The address is kept for later.",
			proxyAuto: "Default address with no port: keep automatic environment / system proxy discovery; connect directly if none is found. Port 80 is not assumed.",
			proxyExplicit: "Use this HTTP(S) CONNECT proxy instead of the automatically detected one. SOCKS-only ports are not supported.",
			proxyApplyHelp: "Saving applies to new requests without interrupting a running call. Sessions already using SSE stay on SSE. Original retry limits are unchanged.",
			proxySave: "Save network settings",
			proxyReload: "Reload settings",
			proxySaved: "Saved. New requests use these settings.",
			proxyLoadFailed: "Network settings could not be loaded. Reload, or activate the updated plugin backend.",
			proxySaveFailed: "Could not confirm that network settings were saved. Reload to check their current state.",
			proxyInvalid: "Enter an HTTP(S) proxy address without credentials or a path, and a port from 1 to 65535. If both fields specify a port, they must match.",
			proxyConflict: "Another page changed these settings. Reload before saving again."
		};
		const zh = {
			nav: "订阅登录",
			title: "订阅登录",
			loadingAccount: "正在加载账户…",
			signedOut: "尚未登录",
			signingIn: "正在等待授权…",
			waitingForCredential: "等待输入套餐 API Key…",
			waitingForCallback: "等待输入授权回调地址…",
			waitingForAuthInput: "等待输入授权信息…",
			signedIn: "已登录",
			login: "登录",
			connectPlan: "连接套餐",
			loginAgain: "重新登录",
			reopenAuthorization: "重新打开授权页",
			cancelLogin: "取消",
			logout: "退出",
			working: "处理中…",
			userCode: "授权码",
			openUrl: "授权",
			openPlanPage: "套餐页面",
			credentialHelp: "请在套餐页新建或复制专用 API Key，再粘贴到这里。密钥只保存在 DSH 的私有凭据文件中。",
			credentialPlaceholder: "粘贴套餐 API Key",
			saveCredential: "保存并连接",
			credentialRequired: "请先粘贴套餐 API Key。",
			callbackHelp: "请在浏览器完成授权后，复制完整的回调地址并粘贴到这里。DSH 只用它完成本次登录。",
			callbackPlaceholder: "粘贴授权回调地址",
			submitCallback: "完成登录",
			callbackRequired: "请先粘贴授权回调地址。",
			authInputHelp: "请输入服务商要求的内容以继续授权。",
			authInputPlaceholder: "输入授权信息",
			submitAuthInput: "继续",
			authInputRequired: "请先输入服务商要求的授权信息。",
			requestFailed: "登录请求失败。",
			proxyTitle: "网络代理",
			proxyScope: "仅影响本订阅插件发出的请求，不修改系统或浏览器代理。",
			proxyLoading: "正在加载网络设置…",
			proxyHttpEnabled: "HTTP 使用代理",
			proxyWsEnabled: "WebSocket 使用代理",
			proxyHttpHelp: "用于登录、令牌刷新、HTTPS / SSE 模型请求和模型列表。",
			proxyWsHelp: "用于模型的 WebSocket 连接。此开关只控制是否走代理，不关闭 WebSocket 本身。",
			proxyAddress: "代理地址（HTTP / HTTPS）",
			proxyPort: "端口",
			proxyPortPlaceholder: "例如 45678",
			proxyDirect: "已关闭：直接连接，忽略代理环境变量。保留地址，方便下次开启。",
			proxyAuto: "默认地址、端口留空：沿用环境变量、系统代理等自动发现；没有找到代理时直连，不会默认使用 80 端口。",
			proxyExplicit: "优先使用此 HTTP(S) CONNECT 代理，不使用自动发现的地址。不支持纯 SOCKS 端口。",
			proxyApplyHelp: "保存后用于新请求，不中断正在进行的调用。已降级的会话继续使用 SSE，原有重试上限不变。",
			proxySave: "保存网络设置",
			proxyReload: "重新加载",
			proxySaved: "已保存，新请求将使用这些设置。",
			proxyLoadFailed: "网络设置加载失败。请重新加载，或先启用更新后的插件服务端。",
			proxySaveFailed: "未能确认网络设置已保存，请重新加载后检查当前设置。",
			proxyInvalid: "请填写不含账号密码或路径的 HTTP(S) 代理地址，端口为 1–65535。若地址中也有端口，须与端口栏一致。",
			proxyConflict: "其他页面已修改设置，请重新加载后再保存。"
		};
		/** `model-search` namespace: copy for the searchable composer model seat. */
		const searchEn = {
			placeholder: "Search models…",
			aria: "Filter models",
			empty: "No models match “{query}”.",
			all: "All",
			freeOnly: "Free only",
			freeFilterAria: "Model price filter (OpenRouter)",
			free: "Free · Rate limited",
			freeCached: "Free (cached) · Recheck pending",
			freeEnded: "Free offer ended · Paid calls blocked",
			freeUnknown: "Price unconfirmed · Free guard active",
			tools: "Tool calling",
			chatOnly: "Chat only",
			context: "{tokens} context",
			emptyFree: "No matching free OpenRouter models. Clear the search or refresh the catalog.",
			syncSchedule: "OpenRouter · Sync every 15 min",
			syncing: "Syncing models…",
			syncSignIn: "Sign in to OpenRouter to sync models.",
			syncRefresh: "Refresh models",
			syncCooldown: "Refreshed within 60s",
			syncUpdated: "Last synced",
			syncStale: "Cached · Refresh needed",
			syncBuiltin: "Not synced yet; using built-in models.",
			syncError: "Sync failed. Keeping the previous list; retry later.",
			syncSaveError: "Could not save the safe catalog cache. Keeping the previous list; check DSH disk permissions.",
			syncRestart: "Restart DSH to activate the new model-sync backend.",
			freeHelp: "Free models have rate and daily limits. Unavailable models never fall back to paid ones.",
			forcedPluginWarning: "Disable account-enforced paid OpenRouter plugins: DSH cannot override platform-enforced charges."
		};
		const searchZh = {
			placeholder: "搜索模型…",
			aria: "筛选模型",
			empty: "没有匹配“{query}”的模型。",
			all: "全部",
			freeOnly: "仅免费",
			freeFilterAria: "模型价格筛选（OpenRouter）",
			free: "免费 · 有限额",
			freeCached: "免费缓存 · 待更新",
			freeEnded: "免费已结束 · 付费已拦截",
			freeUnknown: "价格未确认 · 免费保护中",
			tools: "支持工具调用",
			chatOnly: "仅聊天",
			context: "{tokens} 上下文",
			emptyFree: "没有匹配的 OpenRouter 免费模型。请清空搜索或刷新列表。",
			syncSchedule: "OpenRouter · 每 15 分钟同步",
			syncing: "正在同步模型…",
			syncSignIn: "登录 OpenRouter 后自动同步模型。",
			syncRefresh: "刷新模型",
			syncCooldown: "60 秒内已刷新",
			syncUpdated: "上次同步",
			syncStale: "缓存待更新",
			syncBuiltin: "尚未同步，暂用内置模型列表。",
			syncError: "同步失败，保留上次列表；请稍后重试。",
			syncSaveError: "安全缓存保存失败，保留上次列表；请检查 DSH 目录写入权限。",
			syncRestart: "请重启 DSH，启用新的模型同步服务。",
			freeHelp: "免费模型有速率和每日限额；不可用时不会切换到付费模型。",
			forcedPluginWarning: "请关闭 OpenRouter 账户强制启用的收费插件；平台强制规则不能由 DSH 覆盖。"
		};
		//#endregion
		//#region src/client/openrouter-store.ts
		function validSnapshot(value) {
			if (typeof value !== "object" || value === null) return false;
			const data = value;
			const timestamp = (entry) => entry === null || typeof entry === "number" && Number.isFinite(entry) && entry > 0 && entry <= 864e13;
			if (data.version !== 1 || typeof data.connected !== "boolean" || typeof data.refreshing !== "boolean" || typeof data.stale !== "boolean" || !timestamp(data.lastUpdatedAt) || !timestamp(data.lastAttemptAt) || !timestamp(data.nextRefreshAt) || !timestamp(data.retryAt) || !Array.isArray(data.models) || data.models.length > 1e4) return false;
			return data.models.every((entry) => {
				if (typeof entry !== "object" || entry === null) return false;
				const model = entry;
				return typeof model.id === "string" && typeof model.name === "string" && typeof model.tools === "boolean" && typeof model.freeOnly === "boolean" && typeof model.contextWindow === "number" && Number.isFinite(model.contextWindow) && [
					"free",
					"paid",
					"unknown"
				].includes(String(model.priceStatus));
			});
		}
		/** One metadata store/poll per browser plugin, shared by settings and menus. */
		var OpenRouterCatalogClient = class {
			request;
			state = {
				data: null,
				loading: false,
				error: null
			};
			listeners = /* @__PURE__ */ new Set();
			pending;
			controller;
			poll;
			lastRead = -Infinity;
			disposed = false;
			constructor(request = (...args) => globalThis.fetch(...args)) {
				this.request = request;
			}
			getSnapshot = () => this.state;
			subscribe = (listener) => {
				this.listeners.add(listener);
				if (this.listeners.size === 1 && !this.disposed) this.load();
				return () => {
					this.listeners.delete(listener);
					if (this.listeners.size === 0) {
						clearTimeout(this.poll);
						this.poll = void 0;
					}
				};
			};
			update(state) {
				this.state = state;
				for (const listener of this.listeners) listener();
			}
			failed(error) {
				if (this.disposed) return;
				this.update({
					...this.state,
					error,
					data: this.state.data === null ? null : {
						...this.state.data,
						stale: true
					}
				});
			}
			load = (force = false) => {
				if (this.disposed) return Promise.resolve();
				if (this.pending !== void 0) return this.pending;
				if (!force && Date.now() - this.lastRead < 1500) {
					this.schedule();
					return Promise.resolve();
				}
				this.lastRead = Date.now();
				clearTimeout(this.poll);
				this.poll = void 0;
				this.controller = new AbortController();
				const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(2e4)]);
				this.update({
					...this.state,
					loading: true,
					error: null
				});
				const pending = this.read(force, signal).finally(() => {
					if (this.pending !== pending) return;
					this.pending = void 0;
					this.controller = void 0;
					if (!this.disposed) {
						this.update({
							...this.state,
							loading: false
						});
						this.schedule();
					}
				});
				this.pending = pending;
				return pending;
			};
			async read(force, signal) {
				try {
					const response = await this.request(force ? OPENROUTER_REFRESH_PATH : OPENROUTER_CATALOG_PATH, {
						method: force ? "POST" : "GET",
						credentials: "same-origin",
						headers: { accept: "application/json" },
						signal
					});
					if (response.status === 404) {
						this.failed("restart");
						return;
					}
					if (!response.ok) throw new Error("catalog unavailable");
					const data = await response.json();
					if (!validSnapshot(data)) throw new Error("invalid catalog response");
					if (!this.disposed) this.update({
						...this.state,
						data,
						error: null
					});
				} catch {
					this.failed("unavailable");
				}
			}
			schedule() {
				if (this.disposed || this.listeners.size === 0) return;
				clearTimeout(this.poll);
				this.poll = setTimeout(() => {
					this.load();
				}, this.state.data?.refreshing ? 2e3 : 6e4);
			}
			dispose() {
				this.disposed = true;
				clearTimeout(this.poll);
				this.controller?.abort();
				this.listeners.clear();
			}
		};
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-oauth-login-client";
		const inject = [
			"slots",
			"locale",
			"sessions",
			"modelDirectories",
			"remote",
			"remote.session"
		];
		function apply(ctx) {
			const catalog = new OpenRouterCatalogClient();
			ctx.effect(() => () => catalog.dispose(), "dsh-oauth-login: catalog metadata");
			const searchNs = "model-search";
			ctx.effect(() => ctx.locale.register(searchNs, {
				zh: searchZh,
				en: searchEn
			}), "dsh-oauth-login: model-search copy");
			const ts = ctx.locale.bind(searchNs);
			const namespace = "settings.pi-login";
			ctx.effect(() => ctx.locale.register(namespace, {
				zh,
				en
			}), "dsh-oauth-login: settings copy");
			const t = ctx.locale.bind(namespace);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "pi-login",
				order: 17,
				label: () => t("nav"),
				inject: () => ({
					t,
					ts,
					catalog
				})
			}, PiLoginSettings));
			ctx.slots.inject("conversation.input.model", () => ctx.slots.register({
				name: "conversation.input.model",
				locale: "model",
				priority: -1,
				inject: (sessionId) => {
					const directory = ctx.modelDirectories.directoryFor(sessionId);
					const available = ctx.sessions.subagentAddress(sessionId) === void 0;
					return {
						available,
						catalog,
						directory: directory.store,
						load: () => {
							if (available) directory.load().catch(() => {});
						},
						select: (selection) => available ? directory.select(selection) : Promise.resolve(void 0),
						ts
					};
				}
			}, SearchableModelSelect));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map