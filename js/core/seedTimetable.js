import { createSubject, createSession } from './models.js';
import { todayKey, mondayOf } from './dates.js';

const COURSES = [
  {
    code: 'IT221', name: 'Digital Logic', day: 'MON', start: '19:00', duration: 60, lecturer: 'Pharrol Kazeze (Mr)',
  },
  {
    code: 'IT222', name: 'Parallel and Distributed Systems', day: 'TUE', start: '19:00', duration: 60, lecturer: 'Priyah Mohan (Ms)',
  },
  {
    code: 'IT223', name: 'Networking and Data Communication II', day: 'THU', start: '19:00', duration: 60, lecturer: 'Kapenya Chiperezi (Mr)',
  },
  {
    code: 'IT224', name: 'Real Time and Embedded Systems', day: 'WED', start: '20:00', duration: 60, lecturer: 'Priyah Mohan (Ms)',
  },
  {
    code: 'IT225', name: 'Computer Architecture and Organization', day: 'FRI', start: '18:00', duration: 60, lecturer: 'Priyah Mohan (Ms)',
  },
];

export function seedTimetable(state) {
  // A recurring session never shows before its own anchor date (you can't
  // retroactively have had a class before it existed in the app). Anchor
  // to the Monday of the current week, not "today" — otherwise first
  // opening the app partway through a week (e.g. on a Friday) would hide
  // every earlier weekday's class until the following week, making a
  // freshly-seeded timetable look mostly empty for no reason.
  const anchor = mondayOf(todayKey());

  COURSES.forEach((course) => {
    const subject = createSubject({ name: course.name, priority: 2 });
    state.subjects.push(subject);
    state.sessions.push(createSession({
      subjectId: subject.id,
      title: `${course.code} - ${course.name}`,
      type: 'school',
      date: anchor,
      startTime: course.start,
      durationMinutes: course.duration,
      priority: 2,
      recurrence: { days: [course.day], until: null },
      lecturer: course.lecturer,
    }));
  });

  return state;
}
