import { describe, it, expect } from 'vitest';
import {
  parseSpring,
  parseEase,
  enterFrom,
  exitTo,
  enterTransition,
  exitTransition,
  roleMotion,
  DEFAULT_SPRING_SNAPPY,
  DEFAULT_SPRING_SOFT,
  type MotionTokens,
} from './motion-variants';

const tokens: MotionTokens = {
  fast: 150,
  base: 250,
  slow: 400,
  easeEnter: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
  springSnappy: { stiffness: 500, damping: 35, mass: 1 },
  springSoft: { stiffness: 170, damping: 24, mass: 1 },
  frames: 0,
  intensity: 'normal',
};

describe('token parsing', () => {
  it('reads springs as stiffness damping mass, falling back when malformed', () => {
    expect(parseSpring('300 20 2', DEFAULT_SPRING_SNAPPY)).toEqual({
      stiffness: 300,
      damping: 20,
      mass: 2,
    });
    expect(parseSpring('300 20', DEFAULT_SPRING_SNAPPY)).toEqual({
      stiffness: 300,
      damping: 20,
      mass: 1,
    });
    expect(parseSpring('', DEFAULT_SPRING_SOFT)).toBe(DEFAULT_SPRING_SOFT);
    expect(parseSpring('soft', DEFAULT_SPRING_SOFT)).toBe(DEFAULT_SPRING_SOFT);
    expect(parseSpring('0 -1', DEFAULT_SPRING_SOFT)).toBe(DEFAULT_SPRING_SOFT);
  });

  it('reads cubic-bezier curves and CSS names', () => {
    expect(parseEase('cubic-bezier(0.16, 1, 0.3, 1)')).toEqual([0.16, 1, 0.3, 1]);
    expect(parseEase('linear')).toBe('linear');
    expect(parseEase('ease-in-out')).toBe('easeInOut');
    expect(parseEase('steps(4)')).toBe('easeOut');
  });
});

describe('choices', () => {
  it('maps every enter choice as motion.css does', () => {
    expect(enterFrom('none')).toBe(false);
    expect(enterFrom('fade')).toEqual({ opacity: 0 });
    expect(enterFrom('slide-up')).toEqual({ opacity: 0, y: 10 });
    expect(enterFrom('slide-down')).toEqual({ opacity: 0, y: -10 });
    expect(enterFrom('scale')).toEqual({ opacity: 0, scale: 0.94 });
    expect(enterFrom('pop')).toEqual({ opacity: 0, scale: 0.85 });
    expect(enterFrom('drift')).toMatchObject({ opacity: 0, y: 14, filter: 'blur(3px)' });
  });

  it('maps every exit choice', () => {
    expect(exitTo('none')).toBeUndefined();
    expect(exitTo('fade')).toEqual({ opacity: 0 });
    expect(exitTo('scale')).toEqual({ opacity: 0, scale: 0.94 });
    expect(exitTo('slide-down')).toEqual({ opacity: 0, y: 10 });
  });
});

describe('transitions', () => {
  it("tweens on the Mood's curve for the Mood's duration", () => {
    expect(enterTransition('fade', 250, tokens)).toEqual({
      type: 'tween',
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1],
    });
    expect(exitTransition('fade', 150, tokens)).toEqual({
      type: 'tween',
      duration: 0.15,
      ease: [0.4, 0, 1, 1],
    });
  });

  it('is instant when the duration is 0 (motionScale 0, intensity off) or the choice is none', () => {
    expect(enterTransition('fade', 0, tokens)).toEqual({ duration: 0 });
    expect(enterTransition('none', 250, tokens)).toEqual({ duration: 0 });
    expect(exitTransition('scale', 0, tokens)).toEqual({ duration: 0 });
  });

  it('pop springs snappily; expressive springs every enter softly', () => {
    expect(enterTransition('pop', 250, tokens)).toEqual({ type: 'spring', ...tokens.springSnappy });
    expect(enterTransition('fade', 250, { ...tokens, intensity: 'expressive' })).toEqual({
      type: 'spring',
      ...tokens.springSoft,
    });
  });

  it('steps in frames for pixel Moods, springs included', () => {
    const t = enterTransition('pop', 250, { ...tokens, frames: 4 });
    expect(t.type).toBe('tween');
    expect(typeof t.ease).toBe('function');
    expect((t.ease as (p: number) => number)(0.3)).toBe(0.25);
  });

  it('assembles a role', () => {
    const m = roleMotion('scale', 'fade', 250, 150, tokens);
    expect(m.initial).toEqual({ opacity: 0, scale: 0.94 });
    expect(m.animate).toMatchObject({ opacity: 1, scale: 1 });
    expect(m.exit).toMatchObject({ opacity: 0 });
    expect(m.choice).toEqual({ enter: 'scale', exit: 'fade' });
    expect(roleMotion('none', 'none', 250, 150, tokens).exit).toBeUndefined();
  });
});
