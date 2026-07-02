import { describe, it, expect } from 'vitest';
import { snapValue } from './geometry';

describe('snapValue (resize edge snapping)', () => {
  const edges = [0, 480, 960];

  it('snaps within threshold and reports the guide', () => {
    expect(snapValue(477, edges, 6)).toEqual({ v: 480, guide: 480 });
    expect(snapValue(4, edges, 6)).toEqual({ v: 0, guide: 0 });
  });

  it('leaves values outside threshold untouched', () => {
    expect(snapValue(470, edges, 6)).toEqual({ v: 470, guide: null });
  });

  it('picks the nearest candidate (ties go to the first)', () => {
    expect(snapValue(482, [480, 484], 6).v).toBe(480);
    expect(snapValue(483, [480, 484], 6).v).toBe(484);
  });
});
