window.__ModuleLoader__.load({
  id: "@open-slidestudio/dsh-slides-client",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var jsx = require("react/jsx-runtime");
    var react = require("react");

    var css =
      ".oss-root{min-height:100%;background:#f6f4ef;color:#1b1a17;font-family:ui-sans-serif,system-ui,sans-serif;display:flex;flex-direction:column}" +
      ".oss-head{padding:24px 32px 8px;font-size:22px;letter-spacing:.04em}" +
      ".oss-main{flex:1;display:flex;flex-direction:column;gap:16px;padding:16px 32px 32px;max-width:960px}" +
      ".oss-brief{min-height:88px;width:100%;padding:12px;border:1px solid #d7d1c4;border-radius:12px;font:inherit}" +
      ".oss-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}" +
      ".oss-model{border:1px solid #d7d1c4;border-radius:999px;padding:8px 12px;font:inherit;background:#fff}" +
      ".oss-login{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px}" +
      ".oss-login button{border:1px solid #d7d1c4;background:#fff;padding:6px 10px;border-radius:999px;cursor:pointer;font:inherit}" +
      ".oss-login .is-on{border-color:#1b1a17;background:#1b1a17;color:#f6f4ef}" +
      ".oss-hint{font-size:12px;color:#6b6560;line-height:1.5}" +
      ".oss-send{border:0;background:#1b1a17;color:#f6f4ef;padding:10px 16px;border-radius:999px;cursor:pointer}" +
      ".oss-send:disabled{opacity:.45;cursor:not-allowed}" +
      ".oss-status{min-height:1.4em}" +
      ".oss-error{padding:24px;color:#8a1f11}" +
      ".oss-raster{width:100%;max-width:960px;background:#fff;border:1px solid #d7d1c4;border-radius:8px}" +
      ".oss-links{display:flex;gap:16px;font-size:14px}" +
      ".oss-links a{color:#1b1a17}" +
      ".oss-receipts{font-size:13px;line-height:1.5;white-space:pre-wrap}" +
      "@media (prefers-reduced-motion:reduce){.oss-root *{transition:none!important;animation:none!important}}";

    var PRODUCT_TITLE = "DSH SlideStudio";

    if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css='open-slidestudio-root']")) {
      var tag = document.createElement("style");
      tag.dataset.pluginCss = "open-slidestudio-root";
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    function claimProductTitle() {
      if (typeof document === "undefined") return function () {};
      function applyTitle() {
        if (document.title.indexOf(PRODUCT_TITLE) === -1) document.title = PRODUCT_TITLE;
      }
      applyTitle();
      var titleEl = document.querySelector("title");
      var obs = null;
      if (titleEl && typeof MutationObserver !== "undefined") {
        obs = new MutationObserver(applyTitle);
        obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
      var timer = setInterval(applyTitle, 400);
      return function () {
        if (obs) obs.disconnect();
        clearInterval(timer);
      };
    }

    function isCoverOnlyBrief(text) {
      if (/学习分享|分享会|内部分享/.test(text)) return false;
      return /封面/.test(text) && /一页|单页|一张/.test(text) && !/20\s*页|二十页|约\s*20/.test(text);
    }

    function wantPagesFromBrief(text) {
      if (isCoverOnlyBrief(text)) return 1;
      var about = text.match(/约\s*(\d+)\s*页/);
      if (about) return Number(about[1]);
      var exact = text.match(/(\d+)\s*页/);
      if (exact) return Number(exact[1]);
      if (/勾股|小学/.test(text)) return 6;
      return 0;
    }

    function renderBootFailure(message) {
      return jsx.jsx("div", {
        className: "oss-error",
        role: "alert",
        "data-state": "boot-failure",
        children: ["DSH SlideStudio failed to boot. ", String(message)],
      });
    }

    function SlidesRoot() {
      var initialSession = "";
      try {
        initialSession = new URLSearchParams(window.location.search).get("session") || "";
      } catch (err) {
        initialSession = "";
      }
      var briefState = react.useState("");
      var brief = briefState[0];
      var setBrief = briefState[1];
      var sessionState = react.useState(initialSession);
      var sessionId = sessionState[0];
      var setSessionId = sessionState[1];
      var snapState = react.useState(null);
      var snap = snapState[0];
      var setSnap = snapState[1];
      var errorState = react.useState("");
      var error = errorState[0];
      var setError = errorState[1];
      var busyState = react.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var modelState = react.useState("MiniMax-M3");
      var routeModel = modelState[0];
      var setRouteModel = modelState[1];
      var providerState = react.useState("minimax-cn");
      var routeProvider = providerState[0];
      var setRouteProvider = providerState[1];
      var catalogState = react.useState([]);
      var catalog = catalogState[0];
      var setCatalog = catalogState[1];
      var effortState = react.useState("high");
      var reasoningEffort = effortState[0];
      var setReasoningEffort = effortState[1];
      var oauthState = react.useState([]);
      var oauth = oauthState[0];
      var setOauth = oauthState[1];
      var continueGate = react.useRef({ n: 0, lastPages: -1, inFlight: false });

      function loadOauth() {
        return fetch("/plugins/dsh-oauth-login/auth/status")
          .then(function (res) { return res.ok ? res.json() : []; })
          .then(function (rows) {
            if (!Array.isArray(rows)) return;
            setOauth(rows.filter(function (row) {
              return row && row.id !== "google-antigravity" && !/antigravity|\bagy-/i.test(String(row.id || "") + String(row.route || ""));
            }));
          })
          .catch(function () {});
      }

      react.useEffect(function () {
        var cancelled = false;
        Promise.all([
          fetch("/slides/health").then(function (res) { return res.json(); }),
          fetch("/slides/providers").then(function (res) { return res.json(); }),
        ])
          .then(function (pair) {
            if (cancelled) return;
            var health = pair[0];
            var providers = pair[1];
            var model = health && health.connection && health.connection.model;
            var provider = health && health.connection && health.connection.providerId;
            if (model) setRouteModel(model);
            if (provider) setRouteProvider(provider);
            if (providers && Array.isArray(providers.providers)) setCatalog(providers.providers);
            loadOauth();
          })
          .catch(function () {});
        return function () { cancelled = true; };
      }, []);

      react.useEffect(function () {
        if (!sessionId) return;
        var cancelled = false;
        function maybeContinue(data) {
          if (cancelled || continueGate.current.inFlight) return;
          if (!data || data.agentStatus !== "idle") return;
          if (!data.phase || data.phase.kind === "paused" || data.phase.kind === "failed") return;
          if (data.phase.kind !== "page-ready" && data.phase.kind !== "generating") return;
          if (data.phase.kind === "complete") return;
          var briefText = (data.inspection && data.inspection.brief) || "";
          var want = wantPagesFromBrief(briefText);
          if (want <= 1) return;
          var pages = (data.project && data.project.pageCount) || 0;
          if (continueGate.current.n >= Math.max(want * 2, 4)) return;
          if (continueGate.current.n > 0 && pages <= continueGate.current.lastPages && pages >= want) {
            if (continueGate.current.n >= want + 2) return;
          }
          continueGate.current.inFlight = true;
          continueGate.current.n += 1;
          continueGate.current.lastPages = pages;
          fetch("/slides/sessions/" + sessionId + "/turn", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text:
                "Continue. Host did not pick a template. Write the next unwritten page now. " +
                pages +
                " pages exist. Then render_page and review_page. When every planned page is written, compose_deck and export_deck.",
            }),
          }).finally(function () {
            continueGate.current.inFlight = false;
          });
        }
        function tick() {
          fetch("/slides/state/" + sessionId)
            .then(function (res) { return res.json(); })
            .then(function (data) {
              if (cancelled) return;
              setSnap(data);
              maybeContinue(data);
            })
            .catch(function (err) { if (!cancelled) setError(String(err)); });
        }
        tick();
        var timer = setInterval(tick, 1200);
        return function () {
          cancelled = true;
          clearInterval(timer);
        };
      }, [sessionId]);

      function onOauthLogin(providerId) {
        fetch("/plugins/dsh-oauth-login/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: providerId }),
        })
          .then(function (res) { return res.json(); })
          .then(function (challenge) {
            if (challenge && challenge.url) window.open(challenge.url, "_blank", "noopener");
            var n = 0;
            var timer = setInterval(function () {
              n += 1;
              loadOauth().then(function () {
                fetch("/slides/providers").then(function (res) { return res.json(); }).then(function (data) {
                  if (data && Array.isArray(data.providers)) setCatalog(data.providers);
                });
              });
              if (n > 90) clearInterval(timer);
            }, 2000);
          })
          .catch(function (err) { setError(String(err)); });
      }

      function onGenerate() {
        if (!brief.trim() || busy) return;
        setBusy(true);
        setError("");
        fetch("/slides/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            brief: brief,
            provider: routeProvider,
            model: routeModel,
            reasoningEffort: reasoningEffort,
          }),
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (!data.sessionId) throw new Error(data.error || "session failed");
            setSessionId(data.sessionId);
          })
          .catch(function (err) { setError(String(err)); })
          .finally(function () { setBusy(false); });
      }

      var phase = snap && snap.phase ? snap.phase.kind : sessionId ? "loading" : "empty";
      var rasterUrl =
        sessionId && snap && snap.phase && (snap.phase.kind === "page-ready" || snap.phase.kind === "complete")
          ? "/slides/raster/" + sessionId + "/cover"
          : "";
      var projectRoot = snap && snap.binding ? snap.binding.projectRoot : "";
      var editorHref = projectRoot
        ? "/app/index.html?workspace=1&project=" + encodeURIComponent(projectRoot)
        : "";
      var receipts = snap && snap.inspection && Array.isArray(snap.inspection.receipts)
        ? snap.inspection.receipts
            .map(function (row) {
              return row.state + " · " + row.sourceId;
            })
            .join("\n")
        : "";
      var reviewNote =
        snap && snap.inspection && snap.inspection.visualReviewMissing ? "未做视觉审查" : "";
      var modelId = snap && snap.binding && snap.binding.provider ? snap.binding.provider.modelId : routeModel;
      var waitingResume =
        snap &&
        (snap.rateLimitWait ||
          (phase === "paused" &&
            /provider-rate-limit|provider-token-plan|provider-quota|\b429\b|2056/.test(
              String(snap.phase && snap.phase.detail ? snap.phase.detail : ""),
            )));
      var statusText = error
        ? error
        : phase === "empty"
          ? "等待主题 · " + routeModel
          : waitingResume
            ? modelId + " · waiting"
            : modelId + " · " + phase + (reviewNote ? " · " + reviewNote : "");

      if (error && !sessionId) return renderBootFailure(error);

      return jsx.jsxs("div", {
        className: "oss-root",
        "data-state": phase,
        children: [
          jsx.jsx("div", { className: "oss-head", children: "DSH SlideStudio" }),
          jsx.jsxs("div", {
            className: "oss-main",
            children: [
              jsx.jsx("textarea", {
                className: "oss-brief",
                value: brief,
                placeholder: "一句话，把想法变成漂亮的演示文稿",
                onChange: function (event) { setBrief(event.target.value); },
              }),
              jsx.jsxs("div", {
                className: "oss-row",
                children: [
                  jsx.jsx("select", {
                    className: "oss-model",
                    value: routeProvider + "::" + routeModel,
                    onChange: function (event) {
                      var parts = String(event.target.value).split("::");
                      if (parts[0]) setRouteProvider(parts[0]);
                      if (parts[1]) setRouteModel(parts.slice(1).join("::"));
                    },
                    children: (catalog.length ? catalog : [{ id: routeProvider, name: routeProvider, models: [routeModel] }]).flatMap(function (row) {
                      var models = row.models && row.models.length ? row.models : [routeModel];
                      return models.map(function (id) {
                        return jsx.jsx("option", {
                          value: row.id + "::" + id,
                          children: (row.name || row.id) + " / " + id,
                        }, row.id + "::" + id);
                      });
                    }),
                  }),
                  jsx.jsx("select", {
                    className: "oss-model",
                    value: reasoningEffort,
                    onChange: function (event) { setReasoningEffort(event.target.value); },
                    children: ["low", "medium", "high", "xhigh"].map(function (id) {
                      return jsx.jsx("option", { value: id, children: "thinking " + id }, id);
                    }),
                  }),
                  jsx.jsx("button", {
                    type: "button",
                    className: "oss-send",
                    disabled: busy || !brief.trim(),
                    onClick: onGenerate,
                    children: busy ? "生成中" : "生成",
                  }),
                  jsx.jsx("div", {
                    className: "oss-status",
                    children: statusText,
                  }),
                ],
              }),
              jsx.jsxs("div", {
                className: "oss-login",
                children: oauth.map(function (row) {
                  var on = row.account && row.account.status === "signed-in";
                  return jsx.jsx("button", {
                    type: "button",
                    className: on ? "is-on" : "",
                    onClick: function () { onOauthLogin(row.id); },
                    children: (on ? "已登录 " : "登录 ") + (row.shortName || row.displayName || row.id),
                  }, row.id);
                }),
              }),
              jsx.jsx("div", {
                className: "oss-hint",
                children: "OAuth 写在本产品独立 Home（.oss-oauth-auth.json），不会改 DSH App 的登录文件。测 Grok 先点「登录 Grok」，浏览器走完授权后再生成。thinking 对 Grok 4.6 生效。",
              }),
              jsx.jsxs("div", {
                className: "oss-links",
                children: [
                  jsx.jsx("a", { href: "/app/hub.html", children: "完整创建页" }),
                  editorHref
                    ? jsx.jsx("a", { href: editorHref, children: "打开编辑器" })
                    : null,
                ],
              }),
              rasterUrl
                ? jsx.jsx("img", { className: "oss-raster", alt: "当前封面", src: rasterUrl })
                : null,
              receipts
                ? jsx.jsx("pre", { className: "oss-receipts", children: receipts })
                : null,
            ],
          }),
        ],
      });
    }

    function assertSoleRoot(ctx) {
      var entries = ctx.slots.entries("root") || [];
      if (entries.length > 0) {
        throw new Error(
          "boot-failure: root already has " + entries.length + " registrant(s); DSH SlideStudio must be the only root",
        );
      }
    }

    function installRootCardinalityGuard(ctx) {
      return ctx.slots.subscribe("root", function () {
        var n = (ctx.slots.entries("root") || []).length;
        if (n !== 1) {
          ctx.slots.onEntryError && ctx.slots.onEntryError(function () {});
          document.body.dataset.ossRootError = "cardinality:" + n;
        }
      });
    }

    var inject = ["slots"];

    function stubModelDirectory() {
      return {
        store: {
          getSnapshot: function () {
            return { current: null, routable: null, groups: [], failures: [], status: "ready", error: null };
          },
          subscribe: function () {
            return function () {};
          },
        },
        load: function () {
          return Promise.resolve({ groups: [], failures: [], current: null });
        },
        select: function () {
          return Promise.resolve();
        },
        resetConnected: function () {},
        dispose: function () {},
      };
    }

    function provideShellServices(ctx) {
      if (!ctx.get("modelDirectories")) {
        ctx.provide("modelDirectories", {
          directoryFor: function () {
            return stubModelDirectory();
          },
        });
      }
    }

    function apply(ctx) {
      provideShellServices(ctx);
      ctx.effect(function () {
        assertSoleRoot(ctx);
        var releaseTitle = claimProductTitle();
        var disposeRegistration = ctx.slots.register({ name: "root" }, SlidesRoot);
        var unsub = installRootCardinalityGuard(ctx);
        return function () {
          releaseTitle && releaseTitle();
          unsub && unsub();
          disposeRegistration && disposeRegistration();
        };
      }, "slides-client: unique root");
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.renderBootFailure = renderBootFailure;
    return module.exports;
  },
});
