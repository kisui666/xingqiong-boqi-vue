/**
 * 《星穹播棋》全局类型定义（V0.3 角色技能版）
 * ------------------------------------------------------------------
 * 本文件同时被三层引用，形状一旦定稿禁止随意改动：
 *   1. game/engine.ts      —— 纯函数棋盘引擎
 *   2. p2p/useP2PGame.ts   —— WebRTC 联机模块
 *   3. components/*        —— Vue UI 组件
 */

// ==================== 棋盘与对局状态 ====================

/**
 * 玩家编号（与 PeerID 解耦：客户端本地把 host/guest 映射到 0/1）
 * 0 = 房主（棋盘下方，坑位 0~5，计分 stores[0]）
 * 1 = 访客（棋盘上方，坑位 6~11，计分 stores[1]）
 */
export type PlayerId = 0 | 1;

/**
 * 权威棋盘：固定长度 12 的整数数组（纯坑位，无计分槽）
 *   索引 0~5  : 玩家0 的六个普通坑位
 *   索引 6~11 : 玩家1 的六个普通坑位
 * 每个元素 = 该坑内棋子数量。计分坑单独放在 GameState.stores。
 */
export type Board = number[];

/** 双方计分坑：[玩家0, 玩家1] */
export type Stores = [number, number];

/** 角色技能效果（贴在坑上的临时状态） */
export interface Effect {
  /** 'forget' = 长夜月遗忘（不可被捕获 + 数字对其隐藏）；'solid' = 丹恒固化（不可被捕获） */
  type: 'forget' | 'solid';
  /** 该坑所属玩家 */
  owner: PlayerId;
  /** 该坑 board 下标 */
  pit: number;
  /** 剩余回合数，每轮到效果所属玩家时 -1，到 0 清理 */
  remainTurns: number;
}

export interface GameState {
  /** 12 元素权威棋盘 */
  board: Board;
  /** 独立计分坑 */
  stores: Stores;
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
  // —— 技能系统新增字段 ——
  /** 双方角色 id（'' = 未选）；PvE 的 AI 侧固定为 '' */
  chars: [string, string];
  /** 每人主动技能是否已用过（每局限 1 次） */
  skillUsed: [boolean, boolean];
  /** 当前生效的贴坑效果 */
  effects: Effect[];
  /** 昔涟悔棋：上一回合开始时的状态快照（只存一层） */
  snapshot?: GameState;
  /** 缇宝本回合选择的播种方向（未选时由规则默认） */
  direction?: 'cw' | 'ccw';
}

// ==================== 落子结果 ====================

/** 非法操作错误码：引擎与 P2P 校验共用 */
export enum MoveErrorCode {
  /** 对局已结束 */
  GameFinished = 'GAME_FINISHED',
  /** 落子发起者不是当前回合玩家（P2P 层使用） */
  NotYourTurn = 'NOT_YOUR_TURN',
  /** 索引越界 / 非整数 */
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
  /** 本次被选中的坑位索引（board 下标，0~11） */
  pitIndex: number;
  /** 最后一颗棋子的落点（逻辑位 0~13，含计分位；供动画用） */
  lastIndex: number;
  /** 本次播种的逻辑路径（含计分位；供动画飞子用） */
  sowPath: number[];
}

export interface MoveFailure {
  ok: false;
  error: MoveErrorCode;
}

export type MoveResult = MoveSuccess | MoveFailure;

// ==================== 播种钩子（角色被动接入点） ====================

/**
 * applyMove 的可选 hooks：角色被动通过 dispatcher 构造后传入，
 * 让播种/捕获的每一步都能被被动介入。无 hooks 时 applyMove 行为与
 * 纯曼卡拉完全一致（被动不触发）。
 */
export interface SowHooks {
  /** 每播一颗到某逻辑位时回调（含计分位） */
  onSowStep?: (logicalIndex: number, isStore: boolean, owner: PlayerId) => void;
  /**
   * 某普通坑由 0→1（被播种刚好填满）时回调，返回额外加分（阿格莱雅 +2）。
   * owner = 该坑所属玩家（可能是被对手播种的受害者）。默认 0。
   */
  onPitFilled?: (logicalIndex: number, owner: PlayerId) => number;
  /**
   * 一颗落入己方计分坑时回调，返回「额外加分」（白厄 +1）。
   * 默认 0。返回值会额外加到 stores[storeOwner]。
   */
  onSeedIntoStore?: (storeOwner: PlayerId) => number;
  /**
   * 命中捕获条件时回调，返回从对面坑实际取走 / 留下多少。
   *   take  = 进入己方计分的对面棋子数（不含末子，末子单独计入）
   *   leave = 对面坑留下的棋子数（遐蝶保底 1，丹恒 ≥6 免捕获 take=0）
   * 默认 take = 对面全部、leave = 0。
   */
  onCapture?: (oppositeBoardIdx: number, stones: number, owner: PlayerId) => { take: number; leave: number };
  /** 捕获结算完成后回调，返回额外加分（万敌 +1）。默认 0。 */
  onCaptureComplete?: (captured: number, fromOppositeBoardIdx: number) => number;
}

// ==================== P2P 消息协议 ====================

/**
 * 消息方向约定（host 权威结算模型）：
 *   MOVE              guest → host   guest 把点击的坑位上交 host 裁决
 *   SYNC_STATE        host  → guest  host 跑完 applyMove 后广播权威新状态
 *   MOVE_REJECT       host  → guest  非法落子被驳回，附带当前权威状态供 guest 回滚
 *   RECONNECT_REQUEST guest → host   断线重连后请求完整状态
 *   RECONNECT_RESPONSE host → guest  下发完整权威状态，guest 直接覆盖本地
 *   CHAR_CONFIRM      双向   选人盲选：本地已确认（不含角色 id，防提前泄露）
 *   CHAR_REVEAL       host → guest  双方都确认后 host 下发双方角色 id
 */
export type P2PMessageType =
  | 'SYNC_STATE'
  | 'MOVE'
  | 'MOVE_REJECT'
  | 'RECONNECT_REQUEST'
  | 'RECONNECT_RESPONSE'
  | 'CHAR_CONFIRM'
  | 'CHAR_REVEAL';

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

/** MOVE 消息载荷：普通落子只传 pitIndex；技能落子 pitIndex=-1 + skillId/targetPit/direction */
export interface MovePayload {
  pitIndex: number;
  /** 技能发动时填角色 id（普通落子留空） */
  skillId?: string;
  /** 技能目标坑（部分主动技能需要） */
  targetPit?: number;
  /** 缇宝主动选择方向时填 */
  direction?: 'cw' | 'ccw';
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

/** CHAR_CONFIRM 载荷：本地已确认选人（不含角色 id，防泄露） */
export interface CharConfirmPayload {
  confirmed: true;
}

/** CHAR_REVEAL 载荷：host 下发双方角色 id（双方都确认后） */
export interface CharRevealPayload {
  chars: [string, string];
}
