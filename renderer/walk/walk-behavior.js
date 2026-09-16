"use strict";
// 산책 모드 행동 결정: 시장 무드(mood-controller 의 idle/pump/dump) × 산책 리듬
//   idle(평온) : 걷기 5~12초 ↔ 서있기 2~6초 반복, 걷기 시작할 때 가끔 방향 전환
//   pump(급등) : 계속 달리기
//   dump(급락) : 터덜터덜 6~12초 ↔ 서있기 2~4초 반복
//   마우스를 올리면 멈춰 선다(움직이는 개미를 클릭하기 쉽게)
//   개발자 테스트(force)는 지정 시간 동안 무드보다 우선
//   모니터 넘어다니기: 가장자리에서 canLeave(side) 가 true 면 되돌아서지 않고 화면 밖까지 걸어 나간 뒤
//   leaving 을 세운다(walker-app 이 main 에 알림). 옆 모니터 창은 enter() 로 반대편 화면 밖에서 걸어 들어온다
// 이동 속도·재생 속도는 스프라이트 meta 의 speed(72px 기준 px/s)·fps 를 그대로 쓴다
window.BtcPetWalkBehavior = class WalkBehavior {
  constructor(sprites, antPx) {
    this.sprites = sprites;
    this.antPx = antPx;
    this.action = "idle";
    this.clock = 0;
    this.x = null;
    this.dir = 1;
    this.phaseUntil = 0;
    this.forced = null;
    this.forcedUntil = 0;
    this.exiting = null;                    // 화면 밖으로 나가는 중인 방향 (left/right)
    this.leaving = null;                    // 완전히 나갔음 → 넘겨 달라는 신호
    this.goal = null;                       // 거래소 질주: { x, until } — x 까지 달려가 멈춰 선다
    this.arrived = false;                   // 목표에 막 도착했음 (walker-app 이 말풍선에 쓰고 내림)
  }

  // 목표 지점으로 달려가기 (급등·급락·가격 알림). ms 가 지나거나 clearGoal 하면 평소 산책으로
  setGoal(x, ms) {
    if (!Number.isFinite(x)) return;
    this.goal = { x, until: performance.now() + ms, reached: false };
    this.phaseUntil = 0;
  }
  clearGoal() { this.goal = null; }

  // 옆 모니터에서 넘어옴: side 쪽 화면 밖에 세우면 "범위 밖 → 걸어 들어오기" 규칙으로 들어온다
  enter(side, action, minX, maxX) {
    const margin = this.antPx * 0.6;
    this.exiting = null;
    this.leaving = null;
    this.x = side === "left" ? minX - margin : maxX + margin;
    this.dir = side === "left" ? 1 : -1;
    this.setAction(action === "idle" ? "walk" : action);
    this.phaseUntil = 0;
  }

  // 개발자 테스트: 지정 시간 동안 이 동작만. 진행 중이던 질주(goal)·리듬을 끊고 바로 바뀐다
  force(action, ms) {
    if (!this.sprites[action]) return;
    this.forced = action;
    this.forcedUntil = performance.now() + ms;
    this.goal = null;
    this.phaseUntil = 0;
    this.setAction(action);
  }

  setAction(action) {
    if (action === this.action || !this.sprites[action]) return;
    this.action = action;
    this.clock = 0;                         // 새 동작은 첫 프레임부터
  }

  pickPhase(now, moving, rest, mood) {
    const rand = (a, b) => a + Math.random() * (b - a);
    const nextIsMove = this.action !== moving;
    if (nextIsMove && Math.random() < 0.35) this.dir *= -1;
    this.setAction(nextIsMove ? moving : rest);
    const [a, b] = nextIsMove ? (mood === "dump" ? [6, 12] : [5, 12]) : (mood === "dump" ? [2, 4] : [2, 6]);
    this.phaseUntil = now + rand(a, b) * 1000;
  }

  // minX~maxX: 산책 범위(설정 walkRange). 범위 밖에 있으면(설정 변경 직후) 범위 쪽으로 걸어 들어온다
  update(dt, { mood, hovered, minX, maxX, canLeave }) {
    const now = performance.now();
    const margin = this.antPx * 0.6;
    const lo = minX + margin, hi = Math.max(lo, maxX - margin);
    if (this.x === null) this.x = (lo + hi) / 2;
    const outside = this.exiting ? 0 : this.x < lo ? 1 : this.x > hi ? -1 : 0;   // 돌아가야 할 방향
    const movingAction = mood === "pump" ? "run" : mood === "dump" ? "trudge" : "walk";

    if (hovered) {
      this.setAction("idle");
      this.phaseUntil = 0;                  // 마우스가 떠나면 곧바로 다음 리듬을 새로 고른다
    } else if (this.exiting) {
      this.dir = this.exiting === "right" ? 1 : -1;   // 나가는 중엔 멈추거나 되돌아서지 않는다
      if (this.action === "idle") this.setAction(movingAction);
    } else if (outside) {
      this.dir = outside;                   // 범위 밖: 서 있지 말고 범위 안으로 걸어 들어온다
      this.setAction(movingAction);
      this.phaseUntil = 0;
    } else if (this.goal && now < this.goal.until) {
      const dist = this.goal.x - this.x;
      if (Math.abs(dist) > 6) {
        this.dir = Math.sign(dist);
        this.setAction("run");              // 거래소로 질주
      } else {
        if (!this.goal.reached) { this.goal.reached = true; this.arrived = true; }
        this.setAction("idle");             // 도착하면 거래소 앞에 서서 전광판 구경
      }
    } else if (this.forced && now < this.forcedUntil) {
      this.goal = null;
      this.setAction(this.forced);
    } else {
      this.goal = null;
      this.forced = null;
      if (mood === "pump") {
        this.setAction("run");
      } else {
        const moving = mood === "dump" ? "trudge" : "walk";
        const valid = this.action === moving || this.action === "idle";
        if (!valid || now >= this.phaseUntil) this.pickPhase(now, moving, "idle", mood);
      }
    }

    const meta = this.sprites[this.action]?.meta;
    if (!meta) return;
    const speed = (meta.speed || 0) * (this.antPx / 72);
    if (speed > 0) {
      const before = this.x;
      this.x += this.dir * speed * dt;
      if (this.goal && !hovered && !this.exiting && Math.sign(this.goal.x - before) !== Math.sign(this.goal.x - this.x)) {
        this.x = this.goal.x;               // 목표를 지나치지 않게
      }
      if (this.exiting) {                   // 몸이 화면 밖으로 완전히 나가면 넘겨 달라고 신호
        if (this.exiting === "right" ? this.x > maxX + margin : this.x < minX - margin) this.leaving = this.exiting;
      } else if (!outside) {                // 범위 안에서는 가장자리에서 되돌아선다 (넘어갈 수 있으면 나간다)
        if (this.x > hi) {
          if (canLeave?.("right")) this.exiting = "right"; else { this.x = hi; this.dir = -1; }
        }
        if (this.x < lo) {
          if (canLeave?.("left")) this.exiting = "left"; else { this.x = lo; this.dir = 1; }
        }
      }
    }
    this.clock += dt;
  }

  frame() {
    const meta = this.sprites[this.action]?.meta;
    return meta ? Math.floor(this.clock * meta.fps) % meta.frames : 0;
  }
};
