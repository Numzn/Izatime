import { mutate, getState } from '../core/store.js';
import { createFocusSession } from '../core/models.js';
import { bus } from '../core/events.js';

let snapshot = {
  phase: 'idle',
  remainingSeconds: 0,
  isPaused: false,
  cycleCount: 0,
  subjectId: null,
  activeSessionId: null,
};

let intervalHandle = null;

function emit() {
  bus.emit('focus:tick', { ...snapshot });
}

function phaseSeconds(phase) {
  const { settings } = getState();
  if (phase === 'focus') return settings.focusMinutes * 60;
  if (phase === 'longBreak') return settings.longBreakMinutes * 60;
  return settings.breakMinutes * 60;
}

function finalizeActiveSession(completed) {
  if (!snapshot.activeSessionId) return;
  const plannedSeconds = phaseSeconds(snapshot.phase);
  const elapsedSeconds = plannedSeconds - Math.max(0, snapshot.remainingSeconds);
  mutate((state) => {
    const record = state.focusSessions.find((f) => f.id === snapshot.activeSessionId);
    if (!record) return;
    record.completed = completed;
    record.actualMinutes = Math.round(elapsedSeconds / 60);
    record.endedAt = new Date().toISOString();
  });
  snapshot.activeSessionId = null;
}

function beginPhase(phase) {
  snapshot.phase = phase;
  snapshot.remainingSeconds = phaseSeconds(phase);
  snapshot.isPaused = false;

  if (phase === 'focus') {
    const { settings } = getState();
    const record = createFocusSession({
      subjectId: snapshot.subjectId,
      type: 'focus',
      plannedMinutes: settings.focusMinutes,
    });
    mutate((state) => state.focusSessions.push(record));
    snapshot.activeSessionId = record.id;
  }

  emit();
}

function tick() {
  snapshot.remainingSeconds -= 1;
  if (snapshot.remainingSeconds <= 0) {
    const completedPhase = snapshot.phase;
    finalizeActiveSession(true);

    if (completedPhase === 'focus') {
      snapshot.cycleCount += 1;
      const { settings } = getState();
      const nextPhase = snapshot.cycleCount % settings.sessionsBeforeLongBreak === 0 ? 'longBreak' : 'break';
      bus.emit('focus:phase-complete', { phase: completedPhase, next: nextPhase });
      beginPhase(nextPhase);
    } else {
      bus.emit('focus:phase-complete', { phase: completedPhase, next: 'focus' });
      stop();
    }
    return;
  }
  emit();
}

export function start(subjectId = null) {
  if (snapshot.phase !== 'idle') return;
  snapshot.subjectId = subjectId;
  snapshot.cycleCount = 0;
  beginPhase('focus');
  intervalHandle = setInterval(tick, 1000);
}

export function pause() {
  if (snapshot.phase === 'idle' || snapshot.isPaused) return;
  snapshot.isPaused = true;
  clearInterval(intervalHandle);
  intervalHandle = null;
  emit();
}

export function resume() {
  if (snapshot.phase === 'idle' || !snapshot.isPaused) return;
  snapshot.isPaused = false;
  intervalHandle = setInterval(tick, 1000);
  emit();
}

export function stop() {
  clearInterval(intervalHandle);
  intervalHandle = null;
  finalizeActiveSession(false);
  snapshot = {
    phase: 'idle', remainingSeconds: 0, isPaused: false, cycleCount: 0, subjectId: null, activeSessionId: null,
  };
  emit();
}

export function getSnapshot() {
  return { ...snapshot };
}

export function onTick(handler) {
  return bus.on('focus:tick', handler);
}

export function onPhaseComplete(handler) {
  return bus.on('focus:phase-complete', handler);
}
