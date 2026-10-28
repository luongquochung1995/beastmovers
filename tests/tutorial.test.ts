import { describe, expect, it } from 'vitest';
import { Tutorial } from '../src/systems/tutorial';

describe('Hướng dẫn trong màn', () => {
  it('chỉ sang bước kế khi làm đúng việc của bước hiện tại', () => {
    const tut = new Tutorial([
      { text: 'a', until: 'move' },
      { text: 'b', until: 'itemGrabbed' },
    ]);
    expect(tut.trigger('itemGrabbed')).toBe(false);
    expect(tut.trigger('move')).toBe(true);
    expect(tut.current?.text).toBe('b');
    expect(tut.trigger('move')).toBe(false);
    expect(tut.trigger('itemGrabbed')).toBe(true);
    expect(tut.done).toBe(true);
    expect(tut.current).toBeNull();
  });
});
