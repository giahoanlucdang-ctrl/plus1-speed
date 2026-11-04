// On-screen controls for touch devices and narrow (phone-sized) screens:
// an analog joystick and a jump button.
const MOBILE_MAX_WIDTH = 900;
const touchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const narrow = matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);

// Joystick deflection: x right, y forward, magnitude 0..1
export const stick = { x: 0, y: 0 };
export const jump = { held: false, pressed: false };

{
  const update = () => document.body.classList.toggle('touch', touchDevice || narrow.matches);
  update();
  narrow.addEventListener('change', update);

  const base = document.createElement('div');
  base.id = 'joystick';
  const knob = document.createElement('div');
  knob.className = 'knob';
  base.append(knob);

  const jumpBtn = document.createElement('button');
  jumpBtn.id = 'jump-btn';
  jumpBtn.setAttribute('aria-label', 'Jump');
  jumpBtn.textContent = '⤒';

  document.body.append(base, jumpBtn);

  let stickId = null;
  const moveStick = (e) => {
    const r = base.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = e.clientX - (r.left + radius);
    let dy = e.clientY - (r.top + radius);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx *= radius / len;
      dy *= radius / len;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.x = dx / radius;
    stick.y = -dy / radius;
  };
  const releaseStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    stick.x = stick.y = 0;
    knob.style.transform = '';
  };
  base.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    base.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  base.addEventListener('pointerup', releaseStick);
  base.addEventListener('pointercancel', releaseStick);

  let jumpId = null;
  jumpBtn.addEventListener('pointerdown', (e) => {
    jumpId = e.pointerId;
    jumpBtn.setPointerCapture(e.pointerId);
    jump.held = true;
    jump.pressed = true;
    jumpBtn.classList.add('down');
  });
  const releaseJump = (e) => {
    if (e.pointerId !== jumpId) return;
    jumpId = null;
    jump.held = false;
    jumpBtn.classList.remove('down');
  };
  jumpBtn.addEventListener('pointerup', releaseJump);
  jumpBtn.addEventListener('pointercancel', releaseJump);
  jumpBtn.addEventListener('contextmenu', (e) => e.preventDefault());
}
