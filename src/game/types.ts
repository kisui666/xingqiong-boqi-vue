/**
 * 《星穹播棋》全局类型定义
 * ------------------------------------------------------------------
 * 本文件同时被三层引用，形状一旦定稿禁止随意改动：
 *   1. game/engine.ts      —— 纯函数棋盘引擎
 *   2. p2p/useP2PGame.ts   —— WebRTC 联机模块（Step 3）
 *   3. components/*        —— Vue UI 组件（Step 4）
 */

// ==================== 棋盘与对局状态 ====================

/**
 * 玩家编号（与 PeerID 解耦：客户端本地把 host/guest 映射到 0/1）
 * 0 = 房主（棋盘下方，坑位 0~5，计分坑 6）
 * 1 = 访客（棋盘上方，坑位 7~12，计分坑 13）
 */
export type PlayerId = 0 | 1;

/**
 * 一维棋盘，固定长度 14：
 *   索引 0~5  : 玩家0 的六个普通坑位
 *   索引 6    : 玩家0 的计分坑
 *   索引 7~12 : 玩家1 的六个普通坑位
 *   索引 13   : 玩家1 的计分坑
 * 每个元素 = 该坑内棋子数量
 */
export type Board = number[];

export interface GameState {
  board: Board;
  /** 当前轮到谁落子 */
  currentPlayer: PlayerId;
  /**
   * 单调递增的回合数：每完成一次合法落子 +1。
   * P2P 消息靠它做防重放/防错乱校验（只接受 turn 连续推进的消息）。
   */
  turn: number;
  /** 对局是否已终局（一方坑位全空） */
  finished: boolean;
  /** 胜者；终局平分时为 null（平局） */
  winner: PlayerId | null;
}

// ==================== 落子结果 ====================

/** 非法操作错误码：引擎与 P2P 校验共用 */
export enum MoveErrorCode {
  /** 对局已结束 */
  GameFinished = 'GAME_FINISHED',
  /** 落子发起者不是当前回合玩家（P2P 层使用） */
  NotYourTurn = 'NOT_YOUR_TURN',
  /** 索引越界 / 非整数 / 点到了计分坑 */
  InvalidPit = 'INVALID_PIT',
  /** 点到了对方玩家的坑位 */
  OpponentPit = 'OPPONENT_PIT',
  /** 坑内没有棋子 */
  EmptyPit = 'EMPTY_PIT',
}

/** 合法落子：返回全新状态（纯函数，绝不修改入参） */
export interface MoveSuccess {
  ok: true;
  state: GameState;
  /** 最后一颗落入己方计分坑 → 额外回合（currentPlayer 不变） */
  extraTurn: boolean;
  /** 本次落子是否触发了空坑捕获 */
  captured: boolean;
  /** 本次被选中的坑位索引 */
  pitIndex: number;
  /** 最后一颗棋子的落点（Step 4 播种动画用） */
  lastIndex: number;
}

export interface MoveFailure {
  ok: false;
  error: MoveErrorCode;
}

export type MoveResult = MoveSuccess | MoveFailure;

// ==================== P2P 消息协议（Step 3 复用） ====================

/**
 * 消息方向约定（host 权威结算模型）：
 *   MOVE              guest → host   guest 把点击的坑位上交 host 裁决
 *   SYNC_STATE        host  → guest  host 跑完 applyMove 后广播权威新状态
 *   MOVE_REJECT       host  → guest  非法落子被驳回，附带当前权威状态供 guest 回滚
 *   RECONNECT_REQUEST guest → host   断线重连后请求完整状态
 *   RECONNECT_RESPONSE host → guest  下发完整权威状态，guest 直接覆盖本地
 */
export type P2PMessageType =
  | 'SYNC_STATE'
  | 'MOVE'
  | 'MOVE_REJECT'
  | 'RECONNECT_REQUEST'
  | 'RECONNECT_RESPONSE';

export interface P2PMessage<TPayload = unknown> {
  type: P2PMessageType;
  payload: TPayload;
  /** 发送方发送消息时的 state.turn，接收方据此校验合法性 */
  turn: number;
  /**
   * 发送方 peerId，用于“来源伪造识别”。
   * 注意：V0.1 不是密码学签名，仅校验 from === 预期对家 peerId；
   * 恶意客户端仍可伪造 from，真正防伪造需要服务端签发 token（超出 V0.1 范围）。
   */
  from?: string;
}

/** MOVE 消息载荷：只传“点了哪个坑”，不传棋盘 */
export interface MovePayload {
  pitIndex: number;
}

/** SYNC_STATE / RECONNECT_RESPONSE 载荷：整份权威对局状态 */
export type SyncStatePayload = GameState;

/** MOVE_REJECT 载荷：驳回原因 + 当前权威状态（guest 据此回滚乐观更新） */
export interface MoveRejectPayload {
  error: MoveErrorCode;
  currentState: GameState;
}

/** RECONNECT_REQUEST 载荷：guest 上次已知的 turn，供 host 诊断落后程度 */
export interface ReconnectRequestPayload {
  lastKnownTurn: number;
}

/** RECONNECT_RESPONSE 载荷：host 下发的完整权威状态，guest 直接覆盖本地 */
export type ReconnectResponsePayload = GameState;
