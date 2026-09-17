/**
 * useP2PGame —— PeerJS 联机 Composable
 * ==================================================================
 * 【职责边界】
 *   - 只管“连接生命周期 + 消息收发 + host 权威结算流程”；
 *   - 不渲染 UI、不持有玩家分数显示，那是 Step 4 组件的事；
 *   - 游戏权威状态由外部 ref 注入（authorityState），本模块在 host
 *     模式下读写它跑 applyMove，guest 模式下只通过 onSyncState 回调
 *     把 host 下发的权威状态抛给编排层覆盖本地。
 *
 * 【WebRTC 打洞流程一句话版】
 *   1) 双方各自 new Peer(id) → 连上 PeerJS 公共信令服务器(0.peerjs.com)
 *   2) guest 主动 peer.connect(hostId) → 发起 SDP offer
 *   3) 信令服务器充当“邮差”，把 offer/answer/ICE 候选在双方间转发
 *   4) 双边交换 ICE 候选尝试打洞（P2P 直连成功）或走 TURN 中继（失败）
 *   5) 数据通道 open → 可互发 P2PMessage；任一端断开触发重连流程
 *
 * 【V0.1 风险提示】
 *   - 公共信令无 SLA，高峰期可能抽风；
 *   - 对称型 NAT 打洞必失败，需 TURN，稳定免费 TURN 不存在；
 *   - 纯前端防不住恶意客户端伪造 from（protocol.ts 已声明边界）。
 */
import { ref, type Ref } from 'vue';
import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import { applyMove, createInitialState } from '../game/engine';
import { buildMessage, validateIncoming } from './protocol';
import type {
  GameState,
  MoveErrorCode,
  MovePayload,
  MoveRejectPayload,
  MoveSuccess,
  P2PMessage,
  ReconnectRequestPayload,
  ReconnectResponsePayload,
  SyncStatePayload,
} from '../game/types';

/** PeerID 前缀，防止在公共信令上与他人房间撞名 */
const PEER_PREFIX = 'xqboqi-';

/** 房间号字符集（去掉易混 0/O/1/I） */
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 房间号长度 */
const ROOM_LEN = 6;

/** 生成 6 位防撞房间号（后续可抽到 utils/room.ts） */
function generateRoomId(): string {
  let id = '';
  for (let i = 0; i < ROOM_LEN; i++) {
    id += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return id;
}

export type P2PStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';
export type P2PRole = 'host' | 'guest' | null;

export interface UseP2PGameOptions {
  /**
   * host 权威状态引用（外部持有，本模块在 host 模式读写它）。
   * guest 模式下可留空，guest 只通过 onSyncState 接收权威状态。
   */
  authorityState?: Ref<GameState | null>;
  /** 收到 host 下发的 SYNC_STATE / RECONNECT_RESPONSE 后回调 */
  onSyncState?: (state: GameState) => void;
  /** 收到 MOVE_REJECT 后回调（guest 回滚乐观更新用） */
  onMoveReject?: (error: MoveErrorCode, currentState: GameState) => void;
  /**
   * 仅 host：guest 的 MOVE 被权威结算成功后回调。
   * stateBefore = 结算前状态（供编排层重放播种动画），result = 结算结果。
   */
  onRemoteMove?: (result: MoveSuccess, stateBefore: GameState) => void;
  /** guest 发 MOVE 时需要本地 turn；由编排层提供（guest 模式） */
  getLocalTurn?: () => number;
}

export function useP2PGame(options: UseP2PGameOptions = {}) {
  // ---------- 响应式状态（模板直接消费） ----------
  const status = ref<P2PStatus>('idle');
  const myRole = ref<P2PRole>(null);
  const remotePeerId = ref<string | null>(null);
  const myPeerId = ref<string | null>(null);
  const error = ref<string | null>(null);

  // ---------- 非响应式句柄（模板不关心，闭包内用） ----------
  let peer: Peer | null = null;
  let conn: DataConnection | null = null;
  /** guest 记住房间接号：数据通道断开后重拨时复用 */
  let lastHostId: string | null = null;

  // ---------- 内部工具 ----------
  function resetConnHandles() {
    conn = null;
    remotePeerId.value = null;
  }

  function getAuthState(): GameState {
    // host 权威状态未注入时用初始状态兜底（不应发生，保命用）
    return options.authorityState?.value ?? createInitialState();
  }

  // ==================== 创建房间（host） ====================
  /**
   * host 流程：
   *   1) 生成房间号 → 构造 host PeerID（xqboqi-{room}）
   *   2) new Peer(id) → 连上公共信令
   *   3) 监听 peer.on('connection') 等待 guest 接入
   */
  function createRoom(): string {
    const roomId = generateRoomId();
    const id = `${PEER_PREFIX}${roomId}`;
    myRole.value = 'host';
    status.value = 'connecting';
    error.value = null;

    peer = new Peer(id, { debug: 2 });

    // ---- 事件 1：peer.on('open') ----
    // 触发时机：本地与 PeerJS 信令服务器握手成功，拿到可用 PeerID。
    // 业务语义：host 现在“在线”了，可以等 guest 拨入；
    // 此时数据通道尚未建立（P2P 连接要等 guest 发起）。
    peer.on('open', (assignedId: string) => {
      myPeerId.value = assignedId;
      // host 不需要主动 connect，保持 listening 状态
      // status 仍为 connecting，直到 conn.on('open') 才升 connected
    });

    // ---- 事件 2：peer.on('connection') ----
    // 触发时机：guest 在远端 peer.connect(hostId) 后，
    //   信令把 offer 转发到 host，host 接受并完成 ICE 打洞，
    //   数据通道在底层建立，PeerJS 把这条 DataConnection 抛给 host。
    // 业务语义：有客人进房了，host 立即挂上 conn 事件监听。
    peer.on('connection', (incoming: DataConnection) => {
      // 防止重复接入（V0.1 只支持 1v1，后来的直接拒）
      if (conn) {
        incoming.close();
        return;
      }
      conn = incoming;
      remotePeerId.value = incoming.peer;
      attachConnHandlers();
    });

    // ---- 事件 3：peer.on('error') ----
    // 触发时机：信令层错误（ID 被占用、网络断、信令 500 等），
    //   或数据通道错误（打洞失败、ICE 超时）。
    // 业务语义：把错误码翻译成人话暴露给 UI；
    //   'unavailable-id' 说明房间号撞了，提示重新建房。
    peer.on('error', (err: { type?: string; message?: string }) => {
      const t = err.type ?? 'unknown';
      if (t === 'unavailable-id') {
        error.value = `房间号已被占用，请重新创建`;
      } else if (t === 'network' || t === 'server-error') {
        error.value = `信令服务器异常：${t}`;
      } else if (t === 'peer-unavailable') {
        error.value = `对方房间不存在或已离线`;
      } else {
        error.value = `P2P 错误：${t}`;
      }
      status.value = 'disconnected';
    });

    // ---- 事件 4：peer.on('disconnected') ----
    // 触发时机：本地与信令服务器的 WebSocket 断开（如切 WiFi、
    //   浏览器后台休眠杀 socket、信令重启）。注意此事件 ≠ 数据通道
    //   断开：数据通道底层 P2P 连接可能仍活，只是无法再通过信令
    //   给新对家打洞。业务语义：标记信令断，UI 提示重连按钮。
    peer.on('disconnected', () => {
      status.value = 'disconnected';
      error.value = '与信令服务器断开，可点击重连';
    });

    return roomId;
  }

  // ==================== 加入房间（guest） ====================
  /**
   * guest 流程：
   *   1) new Peer(随机ID) → 连上信令
   *   2) peer.connect(hostId) → 主动发起 SDP offer
   *   3) 监听 conn.on('open') → 通道建立，发 RECONNECT_REQUEST 同步首状态
   */
  function joinRoom(roomId: string): void {
    const cleanRoom = roomId.trim().toUpperCase();
    const hostId = `${PEER_PREFIX}${cleanRoom}`;
    lastHostId = hostId;
    const myId = `${PEER_PREFIX}g-${Math.random().toString(36).slice(2, 10)}`;

    myRole.value = 'guest';
    status.value = 'connecting';
    error.value = null;

    peer = new Peer(myId, { debug: 2 });

    peer.on('open', (assignedId: string) => {
      myPeerId.value = assignedId;
      // 主动拨出：触发 SDP offer 生成 + ICE 候选收集
      conn = peer!.connect(hostId, { reliable: true });
      remotePeerId.value = hostId;
      attachConnHandlers();
    });

    peer.on('error', (err: { type?: string; message?: string }) => {
      const t = err.type ?? 'unknown';
      if (t === 'peer-unavailable') {
        error.value = `房间 ${cleanRoom} 不存在或房主已离开`;
      } else {
        error.value = `P2P 错误：${t}`;
      }
      status.value = 'disconnected';
    });

    peer.on('disconnected', () => {
      status.value = 'disconnected';
      error.value = '与信令服务器断开，可点击重连';
    });
  }

  // ==================== 数据通道事件 ====================
  /**
   * 给当前 conn 挂上 open / data / close 监听。
   * host 在 peer.on('connection') 里调用，guest 在 peer.on('open') 后调用。
   */
  function attachConnHandlers() {
    if (!conn) return;

    // ---- conn.on('open') ----
    // 触发时机：底层 RTCPeerConnection 完成 ICE 打洞（或走 TURN），
    //   数据通道进入 open 状态，双方现在可以互发消息。
    // 业务语义：升级到 connected，guest 首次进房时主动发
    //   RECONNECT_REQUEST 拉取 host 完整初始状态。
    conn.on('open', () => {
      status.value = 'connected';
      error.value = null;
      if (myRole.value === 'guest') {
        // 首次进房等价于一次“全量同步请求”
        sendReconnectRequest();
      }
    });

    // ---- conn.on('data') ----
    // 触发时机：对端 conn.send(...) 的任意一条消息到达。
    // 业务语义：先过 protocol 三件套校验，合法才派发到对应处理函数。
    conn.on('data', (raw: unknown) => {
      const localTurn =
        myRole.value === 'host'
          ? getAuthState().turn
          : (options.getLocalTurn?.() ?? 0);

      const check = validateIncoming(raw, remotePeerId.value, localTurn);
      if (!check.ok) {
        // 非法包直接丢弃，绝不进 applyMove；记录便于排查
        console.warn('[P2P] 丢弃非法消息：', check.reason);
        return;
      }
      dispatchMessage(raw as P2PMessage);
    });

    // ---- 事件 5：conn.on('close') ----
    // 触发时机：数据通道彻底关闭（对端 peer.destroy / 浏览器关页 /
    //   P2P 连接长时间无心跳被底层超时回收）。注意：peer.on('disconnected')
    //   是信令层断，conn.on('close') 是数据层断，二者独立。
    // 业务语义：对家已离开，进入断线态，UI 提示重连按钮。
    conn.on('close', () => {
      status.value = 'disconnected';
      error.value = '对端已断开';
      resetConnHandles();
    });

    conn.on('error', (err: Error) => {
      // 数据通道级错误（少见，多数会被 peer.on('error') 捕获）
      error.value = `数据通道错误：${err.message}`;
      status.value = 'disconnected';
    });
  }

  // ==================== 消息派发 ====================
  function dispatchMessage(msg: P2PMessage) {
    switch (msg.type) {
      case 'MOVE':
        // 仅 host 会收到 guest 的 MOVE；guest 收到 MOVE 属异常，忽略
        if (myRole.value === 'host') handleHostMove(msg);
        break;
      case 'SYNC_STATE':
        // guest 接收 host 的权威状态覆盖
        if (myRole.value === 'guest') {
          options.onSyncState?.(msg.payload as SyncStatePayload);
        }
        break;
      case 'MOVE_REJECT':
        if (myRole.value === 'guest') {
          const p = msg.payload as MoveRejectPayload;
          options.onMoveReject?.(p.error, p.currentState);
        }
        break;
      case 'RECONNECT_REQUEST':
        if (myRole.value === 'host') handleReconnectRequest(msg);
        break;
      case 'RECONNECT_RESPONSE':
        if (myRole.value === 'guest') {
          options.onSyncState?.(msg.payload as ReconnectResponsePayload);
        }
        break;
    }
  }

  // ==================== host 权威结算 ====================
  /**
   * host 收到 guest 的 MOVE：
   *   1) 读权威 state，跑 applyMove(state, pitIndex, byPlayer=1)
   *   2) 成功 → 回写 authorityState，广播 SYNC_STATE 给 guest
   *   3) 失败 → 回 MOVE_REJECT { error, currentState } 让 guest 回滚
   */
  function handleHostMove(msg: P2PMessage) {
    const { pitIndex } = msg.payload as MovePayload;
    const state = getAuthState();
    // byPlayer=1：guest 在权威模型里固定为玩家1
    const result = applyMove(state, pitIndex, 1);

    if (result.ok) {
      // 回写权威状态
      if (options.authorityState) options.authorityState.value = result.state;
      // 广播给 guest（host 自己直接用 result.state，不需再走消息）
      sendSyncState(result.state);
      // 通知编排层：host 本地也要重放 guest 这手的动画
      options.onRemoteMove?.(result, state);
    } else {
      // 驳回：附带当前权威状态供 guest 回滚
      sendMoveReject(result.error, state);
    }
  }

  /** host 自己落子后调用：本地已跑完 applyMove，只需广播结果给 guest */
  function broadcastHostMoveResult(newState: GameState) {
    sendSyncState(newState);
  }

  // ==================== 断线重连 ====================
  /**
   * guest 主动重连：发 RECONNECT_REQUEST { lastKnownTurn }。
   * 前提：peer 仍在（信令通道在或可重建）；若 peer 已死需上层先重建 peer。
   * 这里只发请求，host 收到后回 RECONNECT_RESPONSE 覆盖本地。
   */
  function sendReconnectRequest() {
    const lastKnownTurn = options.getLocalTurn?.() ?? 0;
    const msg = buildMessage(
      'RECONNECT_REQUEST',
      { lastKnownTurn } satisfies ReconnectRequestPayload,
      lastKnownTurn,
      myPeerId.value ?? '',
    );
    safeSend(msg);
  }

  /** host 收到 guest 的重连请求：直接下发完整权威状态 */
  function handleReconnectRequest(_msg: P2PMessage) {
    sendReconnectResponse(getAuthState());
  }

  // ==================== 发送原语 ====================
  function sendSyncState(state: GameState) {
    safeSend(
      buildMessage('SYNC_STATE', state, state.turn, myPeerId.value ?? ''),
    );
  }

  function sendMoveReject(errorCode: MoveErrorCode, currentState: GameState) {
    const payload: MoveRejectPayload = { error: errorCode, currentState };
    safeSend(
      buildMessage('MOVE_REJECT', payload, currentState.turn, myPeerId.value ?? ''),
    );
  }

  function sendReconnectResponse(state: GameState) {
    safeSend(
      buildMessage('RECONNECT_RESPONSE', state, state.turn, myPeerId.value ?? ''),
    );
  }

  /** guest 把点击的坑位上交 host 裁决 */
  function sendMove(pitIndex: number, localTurn: number) {
    const payload: MovePayload = { pitIndex };
    safeSend(buildMessage('MOVE', payload, localTurn, myPeerId.value ?? ''));
  }

  /** 底层发送 + 通道状态守卫 */
  function safeSend(msg: P2PMessage) {
    if (!conn || !conn.open) {
      error.value = '数据通道未就绪，消息已丢弃';
      status.value = 'disconnected';
      return;
    }
    conn.send(msg);
  }

  // ==================== 手动重连（UI 按钮） ====================
  /**
   * 用户点击“重连”按钮时调用：
   *   - 若 peer 仍存活但信令断开 → peer.reconnect() 重建信令；
   *   - 若 peer 已死 → 上层应重新调 createRoom/joinRoom，这里只兜底提示。
   * 重连成功后 guest 自动发 RECONNECT_REQUEST 同步状态。
   */
  function reconnect() {
    if (!peer || peer.destroyed) {
      error.value = '底层已销毁，请重新创建/加入房间';
      status.value = 'disconnected';
      return;
    }
    // peer.disconnected 指信令 WebSocket 断，可尝试重连
    if (peer.disconnected) {
      peer.reconnect();
      status.value = 'connecting';
      error.value = null;
      return;
    }
    if (myRole.value === 'guest') {
      // 数据通道还开着：直接重发同步请求即可
      if (conn && conn.open) {
        sendReconnectRequest();
        return;
      }
      // 数据通道已断但信令仍在：重新拨号建连。
      // 新通道 open 后 attachConnHandlers 会自动发 RECONNECT_REQUEST 拉全量状态。
      if (lastHostId) {
        conn = peer.connect(lastHostId, { reliable: true });
        remotePeerId.value = lastHostId;
        attachConnHandlers();
        status.value = 'connecting';
        error.value = null;
      }
    }
  }

  /** 彻底销毁（离开页面/退出房间） */
  function disconnect() {
    conn?.close();
    conn = null;
    peer?.destroy();
    peer = null;
    resetConnHandles();
    status.value = 'idle';
    myRole.value = null;
    myPeerId.value = null;
    error.value = null;
  }

  return {
    // 响应式状态
    status,
    myRole,
    remotePeerId,
    myPeerId,
    error,
    // host 用
    createRoom,
    broadcastHostMoveResult,
    // guest 用
    joinRoom,
    sendMove,
    // 通用
    reconnect,
    disconnect,
  };
}
