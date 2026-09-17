/**
 * P2P 消息协议纯函数模块
 * ==================================================================
 * 全部为纯函数，不依赖 PeerJS / Vue / DOM，可直接在 Vitest(Node) 跑。
 * useP2PGame.ts 收到任何远端数据后，必先过这里的校验三件套：
 *   1) validateMessageStructure —— 字段齐全、类型正确
 *   2) isTurnAcceptable         —— turn 连续性 / 防重放防乱序
 *   3) isFromTrusted            —— 来源伪造识别（from 字段）
 * 任一不过即整包丢弃，绝不送进 applyMove。
 */
import { BOARD_SIZE, isStore } from '../game/constants';
import type {
  GameState,
  MovePayload,
  P2PMessage,
  P2PMessageType,
} from '../game/types';

/** 协议版本号；后续若升级协议可放这里做兼容判断 */
export const P2P_PROTOCOL_VERSION = 1;

/** 合法的 5 种消息类型集合 */
const VALID_TYPES: ReadonlySet<P2PMessageType> = new Set([
  'SYNC_STATE',
  'MOVE',
  'MOVE_REJECT',
  'RECONNECT_REQUEST',
  'RECONNECT_RESPONSE',
]);

/** 校验失败时返回的统一结构 */
export interface ValidationFailure {
  ok: false;
  reason: string;
}
export interface ValidationSuccess {
  ok: true;
}
export type ValidationResult = ValidationSuccess | ValidationFailure;

// ==================== 消息构造（发送方用） ====================

/**
 * 构造一条 P2P 消息。
 * 发送方必须在发出前调用，保证字段完整。
 *
 * @param type    消息类型
 * @param payload 载荷
 * @param turn    发送方当前 state.turn
 * @param from    发送方 peerId（用于接收方伪造识别）
 */
export function buildMessage<TPayload>(
  type: P2PMessageType,
  payload: TPayload,
  turn: number,
  from: string,
): P2PMessage<TPayload> {
  return { type, payload, turn, from };
}

// ==================== 校验 1：结构完整性 ====================

/** 是否为普通整数（非 NaN、非 Infinity） */
function isPlainInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * 校验消息结构：type 合法、turn 是整数、payload 存在、from 为字符串（若提供）。
 * 注意：此处只验“形状”，不验“语义”（turn 大小关系由 isTurnAcceptable 管）。
 */
export function validateMessageStructure(
  msg: unknown,
): ValidationResult {
  if (typeof msg !== 'object' || msg === null) {
    return { ok: false, reason: '消息不是对象' };
  }
  const m = msg as Record<string, unknown>;

  if (typeof m.type !== 'string' || !VALID_TYPES.has(m.type as P2PMessageType)) {
    return { ok: false, reason: `未知消息类型：${String(m.type)}` };
  }
  if (!isPlainInt(m.turn) || (m.turn as number) < 0) {
    return { ok: false, reason: 'turn 非法或为负' };
  }
  if (m.payload === undefined || m.payload === null) {
    return { ok: false, reason: 'payload 缺失' };
  }
  if (m.from !== undefined && typeof m.from !== 'string') {
    return { ok: false, reason: 'from 非字符串' };
  }
  return { ok: true };
}

// ==================== 校验 2：turn 连续性 ====================

/**
 * turn 连续性策略（host 权威模型下分消息类型处理）：
 *
 *   MOVE              guest→host  guest 声称基于 turn=N 落子，
 *                      host 本地 turn 也必须 =N，否则双方状态不同步，拒绝。
 *   SYNC_STATE        host→guest  覆盖式权威推送，turn 必须 >= 本地 turn
 *                      （前进或重连覆盖相等均接受；倒退=陈旧乱序，丢弃）。
 *   MOVE_REJECT       host→guest  内含 currentState，guest 直接采纳，turn 不校验。
 *   RECONNECT_REQUEST guest→host  lastKnownTurn 仅作 host 诊断，turn 字段不校验。
 *   RECONNECT_RESPONSE host→guest 同 SYNC_STATE，覆盖式接受。
 *
 * @param msg       已通过结构校验的消息
 * @param localTurn 接收方当前 state.turn
 */
export function isTurnAcceptable(
  msg: P2PMessage,
  localTurn: number,
): ValidationResult {
  switch (msg.type) {
    case 'MOVE':
    case 'RECONNECT_REQUEST':
      // MOVE 必须严格相等（基于同一回合落子）
      // RECONNECT_REQUEST 的 turn 字段是 guest 的信令时刻 turn，不强制校验
      return msg.type === 'MOVE' && msg.turn !== localTurn
        ? { ok: false, reason: `MOVE turn 不匹配：期望 ${localTurn}，收到 ${msg.turn}` }
        : { ok: true };

    case 'SYNC_STATE':
    case 'RECONNECT_RESPONSE':
      // 覆盖式权威推送：只接受前进或相等的 turn
      return msg.turn < localTurn
        ? { ok: false, reason: `权威 turn 倒退：本地 ${localTurn}，收到 ${msg.turn}` }
        : { ok: true };

    case 'MOVE_REJECT':
      // 内含权威 currentState，guest 直接覆盖，不校验 turn
      return { ok: true };

    default:
      return { ok: false, reason: `未处理的类型：${msg.type}` };
  }
}

// ==================== 校验 3：来源伪造识别 ====================

/**
 * 来源伪造识别：消息 from 必须等于预期的对家 peerId。
 *
 * 【V0.1 边界声明】这不是密码学签名——恶意客户端可以伪造任意 from。
 * 它只防“消息串台/误发”：比如 A 连进房间后误把消息发给 B 的连接。
 * 真正的防伪造需要服务端签发短期 token + HMAC，超出 V0.1 范围。
 *
 * @param msg              已通过结构校验的消息
 * @param expectedRemoteId 接收方预期的对家 peerId；为 null 表示尚未建立对家
 */
export function isFromTrusted(
  msg: P2PMessage,
  expectedRemoteId: string | null,
): ValidationResult {
  if (expectedRemoteId === null) {
    return { ok: false, reason: '尚未建立对家，拒绝任何远端消息' };
  }
  if (msg.from !== expectedRemoteId) {
    return {
      ok: false,
      reason: `来源伪造嫌疑：期望 ${expectedRemoteId}，收到 ${msg.from ?? '空'}`,
    };
  }
  return { ok: true };
}

// ==================== MOVE 载荷校验 ====================

/**
 * MOVE 消息载荷语义校验：pitIndex 必须是己方普通坑位整数。
 * 与 engine.applyMove 的前置校验一致，但在这里提前拦一层，
 * 避免把明显非法的指令送进 host 的权威引擎。
 */
export function validateMovePayload(
  payload: unknown,
): ValidationResult {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'MOVE payload 非对象' };
  }
  const p = payload as MovePayload;
  if (!isPlainInt(p.pitIndex)) {
    return { ok: false, reason: 'pitIndex 非整数' };
  }
  if (p.pitIndex < 0 || p.pitIndex >= BOARD_SIZE) {
    return { ok: false, reason: 'pitIndex 越界' };
  }
  if (isStore(p.pitIndex)) {
    return { ok: false, reason: 'pitIndex 指向计分坑' };
  }
  return { ok: true };
}

// ==================== 三件套聚合 ====================

/**
 * 收到远端数据的统一入口校验：结构 → 来源 → turn →（MOVE 则验载荷）。
 * 任一失败返回 reason，全部通过返回 ok。
 *
 * @param raw              conn.on('data') 的原始数据
 * @param expectedRemoteId 预期对家 peerId
 * @param localTurn        本地 state.turn
 */
export function validateIncoming(
  raw: unknown,
  expectedRemoteId: string | null,
  localTurn: number,
): ValidationResult {
  const struct = validateMessageStructure(raw);
  if (!struct.ok) return struct;

  const msg = raw as P2PMessage;

  const from = isFromTrusted(msg, expectedRemoteId);
  if (!from.ok) return from;

  const turn = isTurnAcceptable(msg, localTurn);
  if (!turn.ok) return turn;

  if (msg.type === 'MOVE') {
    const move = validateMovePayload(msg.payload);
    if (!move.ok) return move;
  }
  return { ok: true };
}
