import { expect, it } from 'vitest';
import { EventBus } from '../src/systems/EventBus';

it('EventBus gọi đúng handler, lưu lịch sử, gỡ được handler', () => {
  const bus = new EventBus(2);
  const seen: string[] = [];
  const off = bus.on('itemBroken', (e) => seen.push(e.itemId));
  bus.onAny((e) => seen.push(`any:${e.type}`));
  bus.emit({ type: 'itemBroken', item: 1, itemId: 'mirror' });
  bus.emit({ type: 'wallHit', item: 1, itemId: 'mirror', speed: 5 });
  off();
  bus.emit({ type: 'itemBroken', item: 2, itemId: 'plant' });
  expect(seen).toEqual(['mirror', 'any:itemBroken', 'any:wallHit', 'any:itemBroken']);
  expect(bus.history).toHaveLength(2);
  expect(bus.count('itemBroken')).toBe(1);
});
