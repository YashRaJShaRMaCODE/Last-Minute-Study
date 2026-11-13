export type TopicPriority = "high" | "medium" | "low";
export type Topic = { id: string; title: string; minutes: number; done: boolean; priority: TopicPriority };
export type Subject = { id: string; name: string; color: string; topics: Topic[]; note: string };
export type SavedState = { subjects: Subject[]; examDate: string; focusSessions: number; studyDays: string[]; focusMinutesByDay: { date: string; minutes: number }[] };

const STORAGE_KEY = "last-minute-study.v1";
const COLORS = ["#584be1", "#e77953", "#258c76", "#bc5b90", "#397db4"];

export const DEFAULT_STATE: SavedState = {
  subjects: [
    {
      id: "biology",
      name: "Biology",
      color: COLORS[0],
      topics: [
        { id: "cell-energy", title: "Cell energy & respiration", minutes: 25, done: false, priority: "medium" },
        { id: "genetics", title: "Genetics: key patterns", minutes: 20, done: false, priority: "medium" },
        { id: "ecology", title: "Ecology diagrams", minutes: 15, done: true, priority: "medium" },
      ],
      note: "",
    },
    {
      id: "economics",
      name: "Economics",
      color: COLORS[1],
      topics: [
        { id: "elasticity", title: "Price elasticity examples", minutes: 20, done: false, priority: "medium" },
        { id: "market-failure", title: "Market failure: 3 causes", minutes: 25, done: false, priority: "medium" },
      ],
      note: "",
    },
    {
      id: "mathematics",
      name: "Mathematics",
      color: COLORS[2],
      topics: [
        { id: "integration", title: "Integration practice set", minutes: 30, done: false, priority: "medium" },
        { id: "probability", title: "Conditional probability", minutes: 20, done: false, priority: "medium" },
      ],
      note: "",
    },
  ],
  examDate: "",
  focusSessions: 0,
  studyDays: [],
  focusMinutesByDay: [],
};

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return false;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function calendarDaysUntil(examDate: string, today: number) {
  if (!isCalendarDate(examDate) || !Number.isFinite(today)) return null;
  const [year, month, day] = examDate.split("-").map(Number);
  const current = new Date(today);
  const examDay = Date.UTC(year, month - 1, day);
  const currentDay = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
  return Math.max(0, Math.round((examDay - currentDay) / 86_400_000));
}

const priorities: TopicPriority[] = ["high", "medium", "low"];

export function buildDailyPlan(subjects: Subject[], dailyBudget: number) {
  const rank: Record<TopicPriority, number> = { high: 0, medium: 1, low: 2 };
  const candidates = subjects.flatMap((subject) => subject.topics
    .filter((topic) => !topic.done)
    .map((topic) => ({ ...topic, subject: subject.name, subjectId: subject.id, color: subject.color })));
  candidates.sort((a, b) => rank[a.priority] - rank[b.priority]);
  const plan: typeof candidates = [];
  let minutes = 0;
  for (const topic of candidates) {
    if (plan.length >= 6) break;
    if (minutes + topic.minutes > dailyBudget) continue;
    plan.push(topic);
    minutes += topic.minutes;
    if (minutes >= dailyBudget) break;
  }
  if (!plan.length && candidates[0]) plan.push(candidates[0]);
  return plan;
}

export function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function recordFocusSession(state: SavedState, date: string, minutes = 25): SavedState {
  if (!isCalendarDate(date) || !Number.isFinite(minutes) || minutes < 1) return state;
  const duration = Math.min(120, Math.floor(minutes));
  const focusMinutesByDay = state.focusMinutesByDay.map((entry) => ({ ...entry }));
  const day = focusMinutesByDay.find((entry) => entry.date === date);
  if (day) day.minutes = Math.min(720, day.minutes + duration);
  else focusMinutesByDay.push({ date, minutes: duration });
  return {
    ...state,
    focusSessions: state.focusSessions + 1,
    studyDays: [...new Set([...state.studyDays, date])].sort().slice(-120),
    focusMinutesByDay: focusMinutesByDay.sort((a, b) => a.date.localeCompare(b.date)).slice(-120),
  };
}

export function focusMinutesForDay(state: SavedState, date: string) {
  return state.focusMinutesByDay.find((entry) => entry.date === date)?.minutes ?? 0;
}

export function currentStudyStreak(studyDays: string[], today: number) {
  const completed = new Set(studyDays);
  const cursor = new Date(today);
  cursor.setHours(12, 0, 0, 0);
  if (!completed.has(localDateKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (completed.has(localDateKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function recentStudyWeek(studyDays: string[], today: number) {
  const completed = new Set(studyDays);
  const end = new Date(today);
  end.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - 6 + index);
    const key = localDateKey(date.getTime());
    return { key, label: date.toLocaleDateString("en", { weekday: "short" }), studied: completed.has(key) };
  });
}

const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_STATE);
const subscribers = new Set<() => void>();
const COLORS_BY_INDEX = (index: number) => COLORS[index % COLORS.length];
let volatileSnapshot: string | null = null;

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseSavedState(snapshot: string): SavedState {
  try {
    const parsed = JSON.parse(snapshot) as Partial<SavedState> | null;
    if (!parsed || !Array.isArray(parsed.subjects)) return DEFAULT_STATE;
    const subjects = parsed.subjects
      .filter((subject): subject is Subject => Boolean(subject && typeof subject.id === "string" && typeof subject.name === "string"))
      .slice(0, 12)
      .map((subject, index) => ({
        id: subject.id.slice(0, 80),
        name: subject.name.slice(0, 48),
        color: COLORS_BY_INDEX(index),
        note: typeof subject.note === "string" ? subject.note.slice(0, 2000) : "",
        topics: (Array.isArray(subject.topics) ? subject.topics : []).slice(0, 40).flatMap((topic) =>
          topic && typeof topic.title === "string"
            ? [{
                id: String(topic.id || makeId()).slice(0, 80),
                title: topic.title.slice(0, 100),
                minutes: Math.min(120, Math.max(5, Number(topic.minutes) || 25)),
                done: Boolean(topic.done),
                priority: priorities.includes(topic.priority) ? topic.priority : "medium",
              }]
            : [],
        ),
      }));
    const examDate = isCalendarDate(parsed.examDate) ? parsed.examDate : "";
    return {
      subjects,
      examDate,
      focusSessions: Math.max(0, Math.floor(Number(parsed.focusSessions) || 0)),
      studyDays: Array.isArray(parsed.studyDays) ? [...new Set(parsed.studyDays.filter(isCalendarDate))].sort().slice(-120) : [],
      focusMinutesByDay: Array.isArray(parsed.focusMinutesByDay)
        ? parsed.focusMinutesByDay.flatMap((entry) => entry && isCalendarDate(entry.date) && Number.isFinite(entry.minutes) && entry.minutes > 0
          ? [{ date: entry.date, minutes: Math.min(720, Math.floor(entry.minutes)) }]
          : []).reduce<{ date: string; minutes: number }[]>((days, entry) => {
            const existing = days.find((day) => day.date === entry.date);
            if (existing) existing.minutes = Math.min(720, existing.minutes + entry.minutes);
            else days.push(entry);
            return days;
          }, []).sort((a, b) => a.date.localeCompare(b.date)).slice(-120)
        : [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function getStudySnapshot() {
  if (volatileSnapshot !== null) return volatileSnapshot;
  if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SNAPSHOT;
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}

export function getServerStudySnapshot() {
  return DEFAULT_SNAPSHOT;
}

export function subscribeToStudyState(callback: () => void) {
  subscribers.add(callback);
  if (typeof window === "undefined") return () => subscribers.delete(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    subscribers.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function updateStudyState(update: (current: SavedState) => SavedState) {
  try {
    const next = update(parseSavedState(getStudySnapshot()));
    const snapshot = JSON.stringify(next);
    let persisted = true;
    try {
      localStorage.setItem(STORAGE_KEY, snapshot);
      volatileSnapshot = null;
    } catch {
      volatileSnapshot = snapshot;
      persisted = false;
    }
    subscribers.forEach((callback) => callback());
    return persisted;
  } catch {
    return false;
  }
}
