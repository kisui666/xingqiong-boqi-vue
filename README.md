# 星穹播棋（Xingqiong Boqi）

纯前端 P2P 联机曼卡拉棋（曼卡拉 + 崩铁世界观包装）。
Vue 3 + TypeScript + Vite + Tailwind v4 + PeerJS + GSAP。零后端，分享链接秒开对战。

> 当前进度：V0.1 最小可玩原型。Step 2 引擎、Step 3 通信层已完成，UI 待 Step 4。

---

## Step 3 本地双标签测试指南

本指南教你用 Chrome 两个标签页实测 PeerJS 通信层的四个关键链路。
当前 `src/App.vue` 是**临时测试夹具**（仅暴露状态 + 调试钩子，无棋盘 UI），Step 4 会替换为正式组件。

### 前置准备

> **注意**：Step 4 已用正式 UI 替换 Step 3 的测试夹具（`window.__p2p` 调试钩子已移除）。
> 下文 Console 驱动方式仅适用于 Step 3 时期代码；现在请直接用页面按钮与棋盘操作。

```bash
npm install        # 首次
npm run dev        # 启动 Vite，默认 http://localhost:5173
```

打开 Chrome，开**两个普通标签页**（不要用无痕，无痕之间不共享 localStorage 也无碍，但保险起见用普通）：
- 标签 A：`http://localhost:5173/`（充当 host）
- 标签 B：`http://localhost:5173/`（充当 guest）

两个标签都按 `F12` 打开 DevTools，切到 Console。当前页面会把调试句柄挂到：
- `window.__p2p` —— useP2PGame 实例（createRoom / joinRoom / sendMove / reconnect ...）
- `window.__authState` —— host 的权威状态 ref（`.value` 读 GameState）

### ① host 权威结算（MOVE → SYNC_STATE / MOVE_REJECT）

测两条路径：合法落子走 SYNC_STATE 广播；非法落子走 MOVE_REJECT 回滚。

**成功路径：**
1. 标签 A 点「创建房间(host)」按钮 → Console 打印 `[夹具] 创建房间: XXXXXX`，记下这 6 位房间号。
2. 标签 B 在输入框填入房间号，点「加入(guest)」。
3. 两个标签顶部 `status` 都应从 `connecting` → `connected`，B 的 `remote` 显示 host 的 peerId。
4. 标签 B（guest）Console 执行：
   ```js
   window.__p2p.sendMove(0, window.__authState.value.turn)
   ```
   - 预期：标签 A 的 `host 权威 turn` +1，标签 B 的 `guest 同步 turn` 也 +1（host 广播了 SYNC_STATE）。
   - 这一步走的是：guest 发 MOVE → host 跑 applyMove(pit=0, byPlayer=1) → 回写 authorityState → 广播 SYNC_STATE → guest onSyncState 覆盖本地。

**驳回路径：**
5. 标签 B Console 执行（故意发非法坑位 pit=6，即计分坑）：
   ```js
   window.__p2p.sendMove(6, window.__authState.value.turn)
   ```
   - 预期：B 的 Console 打印 `[夹具] MOVE 被驳回: EMPTY_PIT` 或 `INVALID_PIT`，`guest 同步 turn` 不前进（回滚到当前权威状态）。
   - 链路：host 的 applyMove 返回 ok:false → 回 MOVE_REJECT { error, currentState } → guest onMoveReject 覆盖本地。

### ③ 断线重连（RECONNECT_REQUEST / RECONNECT_RESPONSE）

1. 先按 ① 走到第 4 步，让两端 connected 且 turn 至少推进过一次。
2. 标签 B 点「重连」按钮（或 Console `window.__p2p.reconnect()`）。
   - 预期：B 的 status 闪 `connecting` 再回 `connected`，`guest 同步 turn` 与 A 的 `host 权威 turn` 重新对齐。
   - 链路：guest 发 RECONNECT_REQUEST { lastKnownTurn } → host 回 RECONNECT_RESPONSE { fullState } → guest 直接覆盖本地。
3. 模拟“硬断”：标签 B 直接刷新页面（F5）。刷新后 peer 重建，需在 B 重新输入房间号点「加入」——首进房时 guest 在 `conn.on('open')` 会自动发一次 RECONNECT_REQUEST，等价于全量同步。观察 B 的 `guest 同步 turn` 是否被 host 覆盖回来。

### ④ WebRTC 打洞 5 事件触发时机

在 Console 观察事件顺序，理解打洞流程。标签 A 创建房间后，在 Console 依次应能看到：

| 顺序 | 事件 | 触发时机 | 你能看到的现象 |
|---|---|---|---|
| 1 | `peer.on('open')` | 与 PeerJS 信令服务器握手成功 | A/B 的 `myPeerId` 被赋值 |
| 2 | `peer.on('connection')`（host）或 `conn.on('open')`（guest） | ICE 打洞完成、数据通道建立 | status 升到 `connected` |
| 3 | `conn.on('data')` | 对端发来消息 | ① 里的状态变化都来自这里 |
| 4 | `peer.on('disconnected')` | 信令 WebSocket 断（切网/后台休眠） | status 掉到 `disconnected`，提示重连 |
| 5 | `conn.on('close')` | 数据通道彻底关闭（对端关页面） | 同上，`remote` 被清空 |

手动触发 4/5：标签 B 按 Ctrl+Shift+I 关掉 DevTools 后直接关标签，A 应在数秒内看到 status → `disconnected` + `对端已断开`（conn.on('close')）。切 A 的 WiFi 再开，可触发 `peer.on('disconnected')`。

### ⑤ protocol 纯函数测试

不依赖浏览器，直接在终端跑：

```bash
npm run test
```

预期：`Test Files 2 passed (2)` / `Tests 50 passed (50)`（引擎 19 + 协议 31）。
覆盖：消息构造、结构校验、turn 连续性（MOVE 严格相等 / SYNC_STATE 不倒退）、来源伪造识别、MOVE 载荷语义、validateIncoming 聚合拦截。

---

## 常见问题（Step 3 阶段）

- **加入后一直 `connecting` 不变 `connected`**：多半是 NAT 打洞失败。同机双标签一般能直连；若跨网络失败，Console 会出现 `peer-unavailable` 或 `network` 错误。V0.1 无 TURN 中继，对称型 NAT 下确实连不上，属预期。
- **`房间号已被占用`**：公共信令上有人用了同一 6 位码。点「创建房间」重新生成即可（码空间 32^6 ≈ 10 亿，撞名概率极低）。
- **浏览器后台休眠断连**：切到别的标签或最小化后，Chrome 会节流 WebSocket，触发 `peer.on('disconnected')`。回前台点「重连」即可恢复。
- **Console 报 `[P2P] 丢弃非法消息`**：说明 protocol 三件套拦下了坏包（turn 不连续 / from 不匹配 / 结构坏）。这是预期行为，不会污染棋盘。

> Step 5 会给出完整的 NAT 穿透失败 / 后台休眠排查清单。
