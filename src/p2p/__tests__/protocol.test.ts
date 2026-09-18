/**
 * P2P 协议纯函数测试（Vitest）
 * 不依赖 PeerJS 实例，全部对 protocol.ts 的纯函数做黑盒校验。
 * 覆盖：消息构造 / 结构校验 / turn 连续性 / 来源伪造识别 /
 *       MOVE 载荷语义 / validateIncoming 聚合。
 */
import { describe, expect, it } from 'vitest';
import {
  buildMessage,
  isFromTrusted,
  isTurnAcceptable,
  validateIncoming,
  validateMessageStructure,
  validateMovePayload,
} from '../protocol';
import { createInitialState } from '../../game/engine';
import type {
  P2PMessage,
  ReconnectRequestPayload,
  SyncStatePayload,
} from '../../game/types';

const REMOTE = 'xqboqi-host-ABC12';
const GUEST = 'xqboqi-g-xyz99';

/** 构造合法 MOVE 的语法糖 */
function moveMsg(turn: number, pitIndex = 0, from = GUEST): P2PMessage {
  return buildMessage('MOVE', { pitIndex }, turn, from);
}

/** 构造合法 SYNC_STATE 的语法糖 */
function syncMsg(turn: number, from = REMOTE): P2PMessage<SyncStatePayload> {
  const state = { ...createInitialState(), turn };
  return buildMessage('SYNC_STATE', state, turn, from);
}

// ==================== 消息构造 ====================

describe('buildMessage', () => {
  it('填入四字段且原样读回', () => {
    const msg = buildMessage('MOVE', { pitIndex: 3 }, 5, GUEST);
    expect(msg.type).toBe('MOVE');
    expect(msg.payload).toEqual({ pitIndex: 3 });
    expect(msg.turn).toBe(5);
    expect(msg.from).toBe(GUEST);
  });
});

// ==================== 结构校验 ====================

describe('validateMessageStructure', () => {
  it('合法 MOVE 通过', () => {
    expect(validateMessageStructure(moveMsg(0)).ok).toBe(true);
  });

  it('type 非法 → 失败', () => {
    expect(validateMessageStructure({ type: 'HACK', payload: {}, turn: 0, from: GUEST }).ok).toBe(false);
  });

  it('turn 非整数 → 失败', () => {
    expect(validateMessageStructure({ type: 'MOVE', payload: {}, turn: 1.5, from: GUEST }).ok).toBe(false);
  });

  it('turn 为负 → 失败', () => {
    expect(validateMessageStructure({ type: 'MOVE', payload: {}, turn: -1, from: GUEST }).ok).toBe(false);
  });

  it('payload 缺失 → 失败', () => {
    expect(validateMessageStructure({ type: 'MOVE', turn: 0, from: GUEST }).ok).toBe(false);
  });

  it('from 类型错（数字）→ 失败', () => {
    expect(validateMessageStructure({ type: 'MOVE', payload: {}, turn: 0, from: 123 }).ok).toBe(false);
  });

  it('非对象（字符串注入）→ 失败', () => {
    expect(validateMessageStructure('{"type":"MOVE"}').ok).toBe(false);
    expect(validateMessageStructure(null).ok).toBe(false);
  });
});

// ==================== turn 连续性 ====================

describe('isTurnAcceptable', () => {
  it('MOVE turn 与本地相等 → 接受', () => {
    expect(isTurnAcceptable(moveMsg(5), 5).ok).toBe(true);
  });

  it('MOVE turn 与本地不等 → 拒绝（状态不同步）', () => {
    expect(isTurnAcceptable(moveMsg(5), 4).ok).toBe(false);
    expect(isTurnAcceptable(moveMsg(5), 6).ok).toBe(false);
  });

  it('SYNC_STATE turn 前进 → 接受', () => {
    expect(isTurnAcceptable(syncMsg(6), 5).ok).toBe(true);
  });

  it('SYNC_STATE turn 相等（重连覆盖）→ 接受', () => {
    expect(isTurnAcceptable(syncMsg(5), 5).ok).toBe(true);
  });

  it('SYNC_STATE turn 倒退 → 拒绝（陈旧/乱序）', () => {
    expect(isTurnAcceptable(syncMsg(4), 5).ok).toBe(false);
  });

  it('MOVE_REJECT 不校验 turn → 总是接受', () => {
    const msg = buildMessage(
      'MOVE_REJECT',
      { error: 'EMPTY_PIT', currentState: createInitialState() },
      0,
      REMOTE,
    );
    expect(isTurnAcceptable(msg, 999).ok).toBe(true);
  });

  it('RECONNECT_REQUEST 不强制 turn → 接受', () => {
    const payload: ReconnectRequestPayload = { lastKnownTurn: 7 };
    const msg = buildMessage('RECONNECT_REQUEST', payload, 7, GUEST);
    expect(isTurnAcceptable(msg, 3).ok).toBe(true);
  });
});

// ==================== 来源伪造识别 ====================

describe('isFromTrusted', () => {
  it('from 等于预期对家 → 接受', () => {
    expect(isFromTrusted(moveMsg(0, 0, REMOTE), REMOTE).ok).toBe(true);
  });

  it('from 不等于预期对家 → 伪造嫌疑，拒绝', () => {
    expect(isFromTrusted(moveMsg(0, 0, 'attacker'), REMOTE).ok).toBe(false);
  });

  it('from 缺失 → 拒绝', () => {
    const m = moveMsg(0) as P2PMessage;
    delete m.from;
    expect(isFromTrusted(m, REMOTE).ok).toBe(false);
  });

  it('尚未建立对家（expectedRemoteId=null）→ 拒绝一切远端', () => {
    expect(isFromTrusted(moveMsg(0), null).ok).toBe(false);
  });

  it('边界声明：恶意客户端可伪造 from，本层只防误发不防伪造', () => {
    // 假装成对家发消息，本层无法识别 → 这正是 V0.1 已知边界
    const forged = moveMsg(0, 0, REMOTE);
    expect(isFromTrusted(forged, REMOTE).ok).toBe(true);
  });
});

// ==================== MOVE 载荷语义 ====================

describe('validateMovePayload', () => {
  it('己方普通坑位整数 → 接受（0~11 均为合法普通坑，无计分槽）', () => {
    expect(validateMovePayload({ pitIndex: 0 }).ok).toBe(true);
    expect(validateMovePayload({ pitIndex: 5 }).ok).toBe(true);
    // 6 现在是合法 P1 坑（不再是计分坑）
    expect(validateMovePayload({ pitIndex: 6 }).ok).toBe(true);
    expect(validateMovePayload({ pitIndex: 11 }).ok).toBe(true);
  });

  it('非整数 pitIndex → 失败', () => {
    expect(validateMovePayload({ pitIndex: 1.5 }).ok).toBe(false);
  });

  it('越界 → 失败（BOARD_SIZE=12，pitIndex ∈ [0,11]）', () => {
    expect(validateMovePayload({ pitIndex: -1 }).ok).toBe(false);
    expect(validateMovePayload({ pitIndex: 12 }).ok).toBe(false);
    expect(validateMovePayload({ pitIndex: 13 }).ok).toBe(false);
    expect(validateMovePayload({ pitIndex: 14 }).ok).toBe(false);
  });

  it('pitIndex 缺失 → 失败', () => {
    expect(validateMovePayload({}).ok).toBe(false);
    expect(validateMovePayload(null).ok).toBe(false);
  });
});

// ==================== 聚合校验 validateIncoming ====================

describe('validateIncoming', () => {
  it('全合法的 MOVE → 通过（from=GUEST，host 视角下对家就是 GUEST）', () => {
    const m = moveMsg(5, 2); // from 默认 GUEST
    expect(validateIncoming(m, GUEST, 5).ok).toBe(true);
  });

  it('结构坏 → 在结构层拦下', () => {
    expect(validateIncoming({ type: 'X' }, REMOTE, 0).ok).toBe(false);
  });

  it('来源伪造 → 在来源层拦下', () => {
    const m = moveMsg(5, 2, 'attacker');
    expect(validateIncoming(m, GUEST, 5).ok).toBe(false);
  });

  it('turn 不连续 → 在 turn 层拦下', () => {
    const m = moveMsg(5, 2);
    expect(validateIncoming(m, GUEST, 4).ok).toBe(false);
  });

  it('MOVE 载荷非法（pitIndex 越界）→ 在载荷层拦下', () => {
    // 12 元素 board 下，pitIndex=12 越界（不是合法坑）
    const m = moveMsg(5, 12);
    expect(validateIncoming(m, GUEST, 5).ok).toBe(false);
  });

  it('SYNC_STATE 倒退 turn → 拦下', () => {
    const m = syncMsg(3, REMOTE);
    expect(validateIncoming(m, REMOTE, 5).ok).toBe(false);
  });
});
