/**
 * 角色模块入口（V0.3 Step 1）
 * 导出 CHARACTERS 字典 / CHARACTER_LIST 列表 / getCharacter(id)。
 */
import type { Character } from './types';
import { aglaiya } from './data';
import { baie } from './data';
import { changyueyue } from './data';
import { danheng } from './data';
import { fengqin } from './data';
import { haiseyin } from './data';
import { kelvdelu } from './data';
import { nakkari } from './data';
import { saifeier } from './data';
import { tibao } from './data';
import { wandi } from './data';
import { xiadie } from './data';
import { xilian } from './data';

export { createDispatcher } from './dispatch';
export type { Dispatcher } from './dispatch';
export type { ActionResult, ActiveContext, Character, GameEvent, PassiveContext } from './types';

/** 角色字典：id → Character */
export const CHARACTERS: Record<string, Character> = {
  baie,
  wandi,
  aglaiya,
  tibao,
  xiadie,
  nakkari,
  fengqin,
  saifeier,
  haiseyin,
  kelvdelu,
  changyueyue,
  danheng,
  xilian,
};

/** 角色列表 */
export const CHARACTER_LIST: Character[] = [
  baie,
  wandi,
  aglaiya,
  tibao,
  xiadie,
  nakkari,
  fengqin,
  saifeier,
  haiseyin,
  kelvdelu,
  changyueyue,
  danheng,
  xilian,
];

/** 按 id 取角色；不存在返回 undefined */
export function getCharacter(id: string): Character | undefined {
  return CHARACTERS[id];
}
