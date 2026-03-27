// Timetable data and mappings
export const schoolData = {
  MON:  ['FN', 'CIV', 'PHY', 'HIS', 'ENG'],
  TUE:  ['BIO', 'RE'],
  WED:  ['FN', 'ENQ', 'CHEM'],
  THUR: ['HS', 'FN', 'ENG'],
  FRI:  ['CHEM', 'B10', 'MATH'],
  SAT:  ['PHY', 'RE']
};

export const studyData = {
  MON:  ['PHY', 'QHS'],
  TUE:  ['RE', 'CHEM'],
  WED:  ['B10', 'QHS'],
  THUR: ['PHY', 'CIVIC'],
  FRI:  ['CHEM', 'QHS'],
  SAT:  ['PHY', 'CHEM', 'CHEM', 'CHEM', 'CHEM']
};

export const subjectFull = {
  FN: 'Food & Nutrition', CIV: 'Civics', PHY: 'Physics',
  HIS: 'History', ENG: 'English', BIO: 'Biology',
  RE: 'Rel. Education', ENQ: 'Enquiry', CHEM: 'Chemistry',
  HS: 'HS', B10: 'Biology', MATH: 'Mathematics',
  QHS: 'QHS', CIVIC: 'Civic Education'
};

export const iconMap = {
  FN:'🍲', CIV:'⚖️', PHY:'⚛️', HIS:'🏛️', ENG:'📖',
  BIO:'🧬', RE:'🕊️', ENQ:'🔍', CHEM:'🧪', HS:'🏫',
  B10:'🧫', MATH:'📐', QHS:'📋', CIVIC:'🏛️', default:'📘'
};

export const days = ['MON','TUE','WED','THUR','FRI','SAT'];

// Validation function (for development/debugging)
export function validateData() {
  const errors = [];

  // Check if all days are present
  days.forEach(day => {
    if (!schoolData[day]) errors.push(`Missing school data for ${day}`);
    if (!studyData[day]) errors.push(`Missing study data for ${day}`);
  });

  // Check if all subject codes have full names
  const allSubjects = new Set();
  Object.values(schoolData).forEach(subjects => subjects.forEach(s => allSubjects.add(s)));
  Object.values(studyData).forEach(subjects => subjects.forEach(s => allSubjects.add(s)));

  allSubjects.forEach(subject => {
    if (!subjectFull[subject] && !iconMap[subject]) {
      errors.push(`Subject "${subject}" missing full name or icon`);
    }
  });

  if (errors.length > 0) {
    console.warn('Data validation errors:', errors);
    return false;
  }

  console.log('Data validation passed');
  return true;
}

// Auto-validate in development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  validateData();
}