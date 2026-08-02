import { diffInDays, todayKey } from '../core/dates.js';

export function isAssignmentDone(assignment) {
  return assignment.status === 'submitted' || assignment.status === 'graded';
}

// Effort-scaled reminder lead time: a two-hour reading doesn't need the
// same runway as a two-week project. Treats estimated hours as a rough
// proxy for days of lead time, capped so nothing nags a month out.
export function reminderLeadDays(assignment) {
  const hours = (assignment.estimatedMinutes || 60) / 60;
  return Math.min(14, Math.max(1, Math.round(hours)));
}

// Derived urgency, not another field for the student to fill in by hand.
// Overridable via assignment.priorityOverride (1-3), same scale used
// everywhere else in the app.
export function computeAssignmentPriority(assignment, subject, referenceDateKey = todayKey()) {
  if (assignment.priorityOverride) return assignment.priorityOverride;

  const daysLeft = diffInDays(referenceDateKey, assignment.dueDate);
  const weight = assignment.weight || 0;
  const subjectPriority = subject?.priority || 2;

  let score = subjectPriority;
  if (daysLeft <= 1) score += 2;
  else if (daysLeft <= 3) score += 1;
  if (weight >= 20) score += 1;

  return Math.max(1, Math.min(3, Math.round(score / 2)));
}

export function getAssignmentsForSubject(state, subjectId) {
  return state.assignments.filter((a) => a.subjectId === subjectId);
}

export function getOpenAssignments(state, { subjectId } = {}) {
  return state.assignments.filter((a) => !isAssignmentDone(a) && (!subjectId || a.subjectId === subjectId));
}

export function getAssignmentsDueOn(state, dateKey) {
  return state.assignments.filter((a) => a.dueDate === dateKey && !isAssignmentDone(a));
}

export function getAssignmentsDueWithin(state, days, referenceDateKey = todayKey()) {
  return getOpenAssignments(state)
    .filter((a) => {
      const daysLeft = diffInDays(referenceDateKey, a.dueDate);
      return daysLeft >= 0 && daysLeft <= days;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getMostUrgentAssignment(state, referenceDateKey = todayKey()) {
  const open = getOpenAssignments(state)
    .map((a) => ({ assignment: a, daysLeft: diffInDays(referenceDateKey, a.dueDate) }))
    .filter((entry) => entry.daysLeft >= 0)
    .sort((a, b) => {
      const marginA = a.daysLeft - reminderLeadDays(a.assignment);
      const marginB = b.daysLeft - reminderLeadDays(b.assignment);
      return marginA - marginB;
    });
  return open[0]?.assignment || null;
}

export function getAssessmentsForSubject(state, subjectId) {
  return state.assessments.filter((a) => a.subjectId === subjectId);
}

export function getAssessmentsOn(state, dateKey) {
  return state.assessments.filter((a) => a.date === dateKey);
}

export function getUpcomingAssessments(state, days, referenceDateKey = todayKey()) {
  return state.assessments
    .filter((a) => {
      const daysLeft = diffInDays(referenceDateKey, a.date);
      return daysLeft >= 0 && daysLeft <= days;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
