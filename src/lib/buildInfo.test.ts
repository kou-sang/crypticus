import { describe, expect, it } from 'vitest';
import { isNewerBuild } from './buildInfo';

describe('isNewerBuild', () => {
  const t = (ms: number) => ms.toString(36);
  it('avisa con versión mayor o misma versión compilada después', () => {
    expect(isNewerBuild(`1.2.1+${t(10)}`, `1.2.0+${t(99)}`)).toBe(true);
    expect(isNewerBuild(`1.10.0+${t(1)}`, `1.9.9+${t(1)}`)).toBe(true);
    expect(isNewerBuild(`1.2.1+${t(20)}`, `1.2.1+${t(10)}`)).toBe(true);
  });
  it('no avisa con el mismo build, uno anterior o un id ilegible', () => {
    expect(isNewerBuild(`1.2.1+${t(10)}`, `1.2.1+${t(10)}`)).toBe(false);
    expect(isNewerBuild(`1.2.0+${t(99)}`, `1.2.1+${t(10)}`)).toBe(false);
    expect(isNewerBuild(`1.2.1+${t(5)}`, `1.2.1+${t(10)}`)).toBe(false);
    expect(isNewerBuild('1.2.1', '1.2.1+abc')).toBe(false);
  });
});
