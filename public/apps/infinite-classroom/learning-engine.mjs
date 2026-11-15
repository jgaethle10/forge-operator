// Evercraft Infinite Classroom: intentionally deterministic offline learning slice.
// No provider SDKs, learner accounts, analytics, payments, network calls, or persistence.
export const BANDS = Object.freeze(["Foundation", "Builder", "Frontier"]);
export const SUBJECTS = Object.freeze(["Evidence", "Water Science", "Systems"]);
export const LESSONS = Object.freeze([
  {
    id: "evidence-foundation", subject: "Evidence", band: "Foundation",
    title: "A map isn't today's answer",
    context: "A map published last year marks a bridge as open. A friend says that proves the bridge is safe to cross today.",
    question: "What's the strongest response?",
    options: [
      { id: "a", label: "The map is official-looking, so it proves the bridge is open." },
      { id: "b", label: "The map is dated evidence. Check current information from the responsible authority before making a travel decision." },
      { id: "c", label: "Maps are never useful evidence." }
    ],
    answer: "b",
    hint: "Separate what a record showed at one time from what is true right now.",
    explanation: "An old map is evidence of a past record, not proof of current conditions. Date, source, and fresh verification matter."
  },
  {
    id: "evidence-builder", subject: "Evidence", band: "Builder",
    title: "When sources disagree",
    context: "A post from Monday says a road is clear. A public agency update from Wednesday reports it closed for repairs.",
    question: "Which claim can you best support?",
    options: [
      { id: "a", label: "The newer, relevant agency update is stronger evidence of Wednesday's reported status, though conditions may change." },
      { id: "b", label: "The Monday post must be true because it appeared first." },
      { id: "c", label: "Both accounts prove the same thing." }
    ],
    answer: "a",
    hint: "Compare source authority, relevance, and the time of observation.",
    explanation: "Evidence can legitimately change over time. Source, timestamp, and limitations belong alongside any claim."
  },
  {
    id: "evidence-frontier", subject: "Evidence", band: "Frontier",
    title: "What five measurements cannot prove",
    context: "A model predicts flooding at one location. Four of five trial runs crossed the model's threshold.",
    question: "Which interpretation avoids overstating the result?",
    options: [
      { id: "a", label: "The model proves an 80% chance of real-world flooding." },
      { id: "b", label: "The result is useless because one run differed." },
      { id: "c", label: "Four of five simulated runs crossed the threshold; real-world probability requires more validation and assumptions." }
    ],
    answer: "c",
    hint: "A fraction of simulation outcomes is not automatically a calibrated real-world probability.",
    explanation: "State exactly what was observed in the simulation and what remains unverified about the model."
  },
  {
    id: "water-foundation", subject: "Water Science", band: "Foundation",
    title: "Follow a drop",
    context: "Snow in a mountain watershed melts during warmer weather.",
    question: "Which sequence describes a possible path toward a river?",
    options: [
      { id: "a", label: "Snowmelt can run into streams that feed rivers, while some water soaks into the ground." },
      { id: "b", label: "All melted snow disappears immediately." },
      { id: "c", label: "Snowmelt can only travel directly into the ocean." }
    ],
    answer: "a",
    hint: "Think about surface runoff, infiltration, and connected waterways.",
    explanation: "Water may flow over land to streams and rivers, infiltrate the soil, or be stored and released later."
  },
  {
    id: "water-builder", subject: "Water Science", band: "Builder",
    title: "Measure a moving river",
    context: "For a simplified river cross-section, discharge Q equals area A times average velocity v. A = 8 m² and v = 3 m/s.",
    question: "What is Q?",
    options: [
      { id: "a", label: "11 m³/s" },
      { id: "b", label: "24 m³/s" },
      { id: "c", label: "2.67 m³/s" }
    ],
    answer: "b",
    hint: "Multiply cross-sectional area by mean velocity. Watch the units.",
    explanation: "Q = 8 m² × 3 m/s = 24 m³/s. The units show a volume passing a cross-section each second."
  },
  {
    id: "water-frontier", subject: "Water Science", band: "Frontier",
    title: "Bigger but slower",
    context: "A fictional river changes from A = 8 m² and v = 3 m/s to A = 14 m² and v = 2 m/s.",
    question: "What happens to simplified discharge?",
    options: [
      { id: "a", label: "It drops from 24 to 12 m³/s." },
      { id: "b", label: "It stays 24 m³/s because the water slowed." },
      { id: "c", label: "It rises from 24 to 28 m³/s despite the lower speed." }
    ],
    answer: "c",
    hint: "Calculate area × velocity for both sections, rather than comparing speed alone.",
    explanation: "Initial Q = 8 × 3 = 24 m³/s. Later Q = 14 × 2 = 28 m³/s. Geometry and velocity both matter."
  },
  {
    id: "systems-foundation", subject: "Systems", band: "Foundation",
    title: "The hidden connection",
    context: "A town's water-pumping station depends on electricity.",
    question: "Why can a power outage affect the water system?",
    options: [
      { id: "a", label: "Water pumping may lose power, unless independent backup or alternative supply is available." },
      { id: "b", label: "Water and electricity are completely unrelated." },
      { id: "c", label: "A power outage always makes the water cleaner." }
    ],
    answer: "a",
    hint: "Trace which equipment needs energy to operate.",
    explanation: "Infrastructure forms networks of dependencies. A disruption can propagate, depending on resilience and backups."
  },
  {
    id: "systems-builder", subject: "Systems", band: "Builder",
    title: "A cascading outage",
    context: "In a fictional town, an electrical substation loses power. A pump station and a clinic both rely on that substation.",
    question: "Which analysis is strongest?",
    options: [
      { id: "a", label: "Only the substation needs assessment because every other service is independent." },
      { id: "b", label: "Check the pump and clinic's backup power, service dependencies, and actual status before predicting downstream impacts." },
      { id: "c", label: "The clinic must already be closed." }
    ],
    answer: "b",
    hint: "Map dependencies, but don't confuse a possible failure with a verified outage.",
    explanation: "A dependency map identifies potential cascades; observed status and backup capacity determine which effects actually occur."
  },
  {
    id: "systems-frontier", subject: "Systems", band: "Frontier",
    title: "Design for the second failure",
    context: "In a classroom simulation, two pumps share one backup generator. A storm might disconnect the main grid and damage generator access.",
    question: "Which redesign addresses a shared failure point?",
    options: [
      { id: "a", label: "Add a second independent power path and test whether it can safely support essential pumping." },
      { id: "b", label: "Paint the generator a brighter color." },
      { id: "c", label: "Assume the generator cannot ever fail." }
    ],
    answer: "a",
    hint: "Look for a single component whose loss defeats multiple backups.",
    explanation: "Independent redundancy, safe operating capacity, and exercised recovery plans reduce common-mode failure risks."
  }
]);
const INDEX = new Map(LESSONS.map(lesson => [lesson.id, lesson]));
export function lessonsFor({subject = "All", band = "All"} = {}) {
  return LESSONS.filter(item =>
    (subject === "All" || item.subject === subject) &&
    (band === "All" || item.band === band)
  );
}
export function gradeAnswer(lessonId, optionId) {
  const lesson = INDEX.get(lessonId);
  if (!lesson) throw new Error("unknown_lesson");
  if (!lesson.options.some(option => option.id === optionId)) throw new Error("unknown_option");
  return { correct: optionId === lesson.answer, explanation: lesson.explanation, lessonId };
}
export function nextLesson({subject = "All", band = "All", completedIds = []} = {}) {
  const completed = new Set(completedIds);
  return lessonsFor({subject, band}).find(lesson => !completed.has(lesson.id)) ?? null;
}
export function progressSummary(completedIds = []) {
  const valid = new Set(completedIds.filter(id => INDEX.has(id)));
  return { completed: valid.size, total: LESSONS.length };
}
