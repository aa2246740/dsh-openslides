# 错峰 WebBridge 采集（03:00）

开发期 oracle：在免费队列空闲时尝试进入官方 PPT 编辑器。

## 已调度

- **本地后台**：`node scripts/webbridge-offpeak-capture.mjs --sleep-until 03:00`  
  （本机需保持唤醒；浏览器保持 Kimi 登录；`kimi-webbridge` daemon 运行中）
- 结果目录：本目录 `result-*.json`、`latest-result.json`、`run.log`、截图

## 手动重跑

```bash
# 立刻试
node scripts/webbridge-offpeak-capture.mjs

# 等到今晚/明早 3:00 再试
node scripts/webbridge-offpeak-capture.mjs --sleep-until 03:00
```

## 前提

1. Mac 不休眠（或接电源 + 防止睡眠）  
2. Chrome 仍登录 Kimi  
3. `~/.kimi-webbridge/bin/kimi-webbridge start`  
4. **不需要**为产品订阅；仅当错峰仍失败且你想抄全编辑器时再考虑会员
