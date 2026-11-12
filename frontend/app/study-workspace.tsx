"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { getServerStudySnapshot, getStudySnapshot, parseSavedState, subscribeToStudyState, updateStudyState } from "./study-state";

const COLORS = ["#584be1", "#e77953", "#258c76", "#bc5b90", "#397db4"];
const STORAGE_WARNING = "Storage is unavailable. Changes stay here until this page reloads or closes.";
const BACKUP_FORMAT = "last-minute-study-backup";
type FocusTarget = { subject: string; title: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function StudyWorkspace() {
  const snapshot = useSyncExternalStore(subscribeToStudyState, getStudySnapshot, getServerStudySnapshot);
  const saved = useMemo(() => parseSavedState(snapshot), [snapshot]);
  const { subjects, examDate, focusSessions } = saved;
  const [query, setQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState("");
  const [topicDrafts, setTopicDrafts] = useState<Record<string, string>>({});
  const [newSubject, setNewSubject] = useState("");
  const [seconds, setSeconds] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [message, setMessage] = useState("");
  const [today, setToday] = useState<number | null>(null);
  const timerInterval = useRef<number | null>(null);
  const secondsRef = useRef(seconds);
  const deadlineRef = useRef<number | null>(null);
  const focusTargetRef = useRef<FocusTarget | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timeout = 0;
    const refreshToday = () => {
      const now = new Date();
      setToday(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime());
      window.clearTimeout(timeout);
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timeout = window.setTimeout(refreshToday, nextDay.getTime() - now.getTime() + 50);
    };
    const refreshWhenActive = () => {
      if (document.visibilityState === "visible") refreshToday();
    };
    refreshToday();
    window.addEventListener("focus", refreshToday);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", refreshToday);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, []);

  const completeFocusSession = useCallback(() => {
    if (deadlineRef.current === null) return;
    const completedTarget = focusTargetRef.current;
    if (timerInterval.current !== null) window.clearInterval(timerInterval.current);
    timerInterval.current = null;
    deadlineRef.current = null;
    secondsRef.current = 0;
    setSeconds(0);
    setTimerRunning(false);
    focusTargetRef.current = null;
    setFocusTarget(null);
    updateStudyState((currentState) => ({ ...currentState, focusSessions: currentState.focusSessions + 1 }));
    setMessage(completedTarget
      ? `Focus session complete for ${completedTarget.title}. Mark it done when you're ready.`
      : "Focus session complete. Take a short break before the next one.");
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    deadlineRef.current ??= Date.now() + secondsRef.current * 1000;
    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      secondsRef.current = remaining;
      setSeconds(remaining);
      if (remaining === 0) completeFocusSession();
    };
    tick();
    timerInterval.current = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (timerInterval.current !== null) window.clearInterval(timerInterval.current);
      timerInterval.current = null;
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timerRunning, completeFocusSession]);

  const totalTopics = subjects.reduce((total, subject) => total + subject.topics.length, 0);
  const finishedTopics = subjects.reduce((total, subject) => total + subject.topics.filter((topic) => topic.done).length, 0);
  const remainingMinutes = subjects.reduce((total, subject) => total + subject.topics.reduce((minutes, topic) => minutes + (topic.done ? 0 : topic.minutes), 0), 0);
  const nextTopic = subjects.flatMap((subject) => subject.topics.filter((topic) => !topic.done).map((topic) => ({ ...topic, subjectId: subject.id, subject: subject.name, color: subject.color })))[0];
  const daysUntilExam = useMemo(() => {
    if (!examDate || today === null) return null;
    const exam = new Date(`${examDate}T00:00:00`);
    if (Number.isNaN(exam.getTime())) return null;
    return Math.max(0, Math.ceil((exam.getTime() - today) / 86_400_000));
  }, [examDate, today]);
  const dailyTarget = daysUntilExam !== null && daysUntilExam > 0
    ? Math.ceil(remainingMinutes / daysUntilExam)
    : null;
  const visibleSubjects = subjects.filter((subject) =>
    `${subject.name} ${subject.topics.map((topic) => topic.title).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const activeNote = subjects.find((subject) => subject.id === selectedNote) || subjects[0];

  const updateSubjects = (update: (current: typeof subjects) => typeof subjects) => {
    return updateStudyState((current) => ({ ...current, subjects: update(current.subjects) }));
  };

  const announceSave = (saved: boolean, successMessage?: string) => {
    if (!saved) setMessage(STORAGE_WARNING);
    else if (successMessage) setMessage(successMessage);
  };

  const addSubject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newSubject.trim();
    if (!name || subjects.length >= 12) return;
    const subject = { id: newId(), name, color: COLORS[subjects.length % COLORS.length], topics: [], note: "" };
    const saved = updateSubjects((current) => [...current, subject]);
    setSelectedNote(subject.id);
    setNewSubject("");
    announceSave(saved, `${name} added to your revision list.`);
  };

  const addTopic = (event: FormEvent<HTMLFormElement>, subjectId: string) => {
    event.preventDefault();
    const title = (topicDrafts[subjectId] || "").trim();
    if (!title) return;
    const saved = updateSubjects((current) => current.map((subject) => subject.id === subjectId
      ? { ...subject, topics: [...subject.topics, { id: newId(), title, minutes: 25, done: false }].slice(0, 40) }
      : subject));
    setTopicDrafts((current) => ({ ...current, [subjectId]: "" }));
    announceSave(saved, "Topic added as a 25-minute session.");
  };

  const toggleTopic = (subjectId: string, topicId: string) => {
    const saved = updateSubjects((current) => current.map((subject) => subject.id === subjectId
      ? { ...subject, topics: subject.topics.map((topic) => topic.id === topicId ? { ...topic, done: !topic.done } : topic) }
      : subject));
    announceSave(saved);
  };

  const updateNote = (value: string) => {
    announceSave(updateSubjects((current) => current.map((subject) => subject.id === activeNote?.id ? { ...subject, note: value.slice(0, 2000) } : subject)));
  };

  const clearWorkspace = () => {
    if (!window.confirm("Clear your subjects, topics, notes, exam date, and focus count from this browser?")) return;
    deadlineRef.current = null;
    focusTargetRef.current = null;
    setFocusTarget(null);
    secondsRef.current = 25 * 60;
    setSeconds(25 * 60);
    setTimerRunning(false);
    const saved = updateStudyState(() => ({ subjects: [], examDate: "", focusSessions: 0 }));
    setSelectedNote("");
    announceSave(saved, "Workspace cleared on this device.");
  };

  const downloadBackup = () => {
    const date = new Date().toISOString().slice(0, 10);
    const backup = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), state: saved };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `last-minute-study-${date}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("Study backup downloaded.");
  };

  const restoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 1_000_000) {
      setMessage("That backup is too large to restore.");
      return;
    }

    let candidate: unknown;
    try {
      candidate = JSON.parse(await file.text()) as unknown;
    } catch {
      setMessage("This file is not a readable study backup.");
      return;
    }
    if (!isRecord(candidate) || candidate.format !== BACKUP_FORMAT || candidate.version !== 1 || !isRecord(candidate.state) || !Array.isArray(candidate.state.subjects)) {
      setMessage("This file is not a supported study backup.");
      return;
    }
    if (!window.confirm("Restore this backup and replace the study plan currently saved in this browser?")) return;

    const restored = parseSavedState(JSON.stringify(candidate.state));
    deadlineRef.current = null;
    focusTargetRef.current = null;
    setFocusTarget(null);
    secondsRef.current = 25 * 60;
    setSeconds(25 * 60);
    setTimerRunning(false);
    const persisted = updateStudyState(() => restored);
    setSelectedNote(restored.subjects[0]?.id || "");
    announceSave(persisted, `Backup restored with ${restored.subjects.length} subjects.`);
  };

  const resetTimer = () => {
    deadlineRef.current = null;
    focusTargetRef.current = null;
    setFocusTarget(null);
    setTimerRunning(false);
    secondsRef.current = 25 * 60;
    setSeconds(25 * 60);
  };

  const toggleTimer = () => {
    if (timerRunning) {
      const remaining = Math.max(0, Math.ceil(((deadlineRef.current ?? Date.now()) - Date.now()) / 1000));
      if (remaining === 0) {
        completeFocusSession();
        return;
      }
      deadlineRef.current = null;
      secondsRef.current = remaining;
      setSeconds(remaining);
      setTimerRunning(false);
      return;
    }
    if (secondsRef.current === 0) {
      secondsRef.current = 25 * 60;
      setSeconds(25 * 60);
    }
    if (!focusTargetRef.current && nextTopic) {
      const target = { subject: nextTopic.subject, title: nextTopic.title };
      focusTargetRef.current = target;
      setFocusTarget(target);
    }
    deadlineRef.current = Date.now() + secondsRef.current * 1000;
    setTimerRunning(true);
  };

  const startTopicFocus = (subject: string, title: string) => {
    if (timerRunning) return;
    const target = { subject, title };
    focusTargetRef.current = target;
    setFocusTarget(target);
    secondsRef.current = 25 * 60;
    setSeconds(25 * 60);
    deadlineRef.current = Date.now() + 25 * 60 * 1000;
    setTimerRunning(true);
    setMessage(`25-minute focus session started for ${title}.`);
    document.getElementById("focus-timer")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  };

  const setExamDate = (value: string) => {
    announceSave(updateStudyState((current) => ({ ...current, examDate: value })));
  };

  return (
    <main className="study-app">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="Last-Minute Study home">
          <span className="brand-icon" aria-hidden="true">L<span>.</span></span>
          <span>last minute<span className="brand-study">study</span></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#overview">Overview</a>
          <a href="#subjects">Subjects</a>
          <a href="#notes">Quick notes</a>
        </nav>
        <a className="top-cta" href="#subjects">Plan a session <span aria-hidden="true">↗</span></a>
      </header>

      <section className="hero" id="overview" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> YOUR REVISION, RE-FOCUSED</p>
          <h1 id="hero-title">One page.<br />One next step.<br /><span>That’s enough.</span></h1>
          <p className="hero-intro">A little structure for the final stretch. Pick one topic, give it 25 minutes, and let the progress add up.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#today">Start a focus session <span aria-hidden="true">↓</span></a>
            <a className="quiet-link" href="#subjects">See my subjects <span aria-hidden="true">↗</span></a>
          </div>
          <div className="hero-foot"><span>01</span><span>small sessions beat a perfect plan</span><span className="foot-rule" /></div>
        </div>
        <div className="hero-art" aria-label="A visual study timer showing a 25-minute focus session" role="img">
          <div className="art-grid" />
          <div className="orbit orbit-large" /><div className="orbit orbit-small" />
          <div className="timer-stamp"><span>FOCUS</span><strong>25</strong><small>MINUTES</small></div>
          <div className="art-note note-top"><b>01</b><span>choose one<br />clear topic</span></div>
          <div className="art-note note-bottom"><b>02</b><span>finish the next<br />small thing</span></div>
          <span className="art-spark spark-one">✳</span><span className="art-spark spark-two">✳</span>
          <p className="art-caption">The last stretch<br />can still be yours.</p>
        </div>
      </section>

      <section className="overview-strip" aria-label="Revision overview">
        <div className="overview-intro"><span className="section-kicker">YOUR BOARD / TODAY</span><p>Keep it light.<br /><strong>Keep it moving.</strong></p><span className="study-pace" aria-live="polite">{remainingMinutes === 0 ? "Your revision list is complete." : daysUntilExam === null ? "Set a date for your daily pace." : daysUntilExam === 0 ? "Exam day · choose a short review." : `About ${dailyTarget} min/day to finish before the exam.`}</span></div>
        <div className="overview-stat"><span>TOPICS DONE</span><strong>{finishedTopics}<small>/{totalTopics}</small></strong><p>{remainingMinutes.toLocaleString()} min left across subjects</p></div>
        <div className="overview-stat"><span>FOCUS SESSIONS</span><strong>{focusSessions.toString().padStart(2, "0")}</strong><p>completed here</p></div>
        <label className="exam-stat"><span>EXAM COUNTDOWN</span><strong>{daysUntilExam === null ? "—" : daysUntilExam.toString().padStart(2, "0")}<small>{daysUntilExam === null ? "set date" : daysUntilExam === 1 ? "day left" : "days left"}</small></strong><input aria-label="Set exam date" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} /></label>
      </section>

      <section className="today-section section-shell" id="today" aria-labelledby="today-title">
        <div className="section-heading">
          <div><p className="section-kicker">MAKE THE NEXT HOUR COUNT</p><h2 id="today-title">Your next move</h2></div>
          <p className="section-aside">No catch-up marathon. Just a clear place to begin.</p>
        </div>
        <div className="today-grid">
          <article className="next-card">
            <div className="card-topline"><span className="mini-index">01</span><span>UP NEXT</span><span className="card-line" /></div>
            {nextTopic ? <>
              <p className="next-subject" style={{ "--subject-color": nextTopic.color } as CSSProperties}>{nextTopic.subject}</p>
              <h3>{nextTopic.title}</h3>
              <p className="next-copy">Give this one your attention. The rest of the list can wait.</p>
              <div className="next-footer"><span>◷ &nbsp;{nextTopic.minutes} min</span><button type="button" className="text-action" onClick={() => toggleTopic(nextTopic.subjectId, nextTopic.id)}>Mark done <span aria-hidden="true">↗</span></button></div>
            </> : <div className="all-done"><h3>Nothing urgent on the list.</h3><p>Add one small topic under Subjects when you are ready.</p><a href="#subjects">Open your subjects ↗</a></div>}
          </article>
          <article className="focus-card" id="focus-timer" aria-labelledby="timer-title">
            <div className="card-topline"><span className="mini-index">02</span><span id="timer-title">A QUIET 25</span><span className="card-line" /></div>
            <div className="timer-face" aria-live="off"><span>{formatTime(seconds)}</span><small>{timerRunning ? "FOCUSING" : focusTarget ? "PAUSED" : seconds === 25 * 60 ? "READY WHEN YOU ARE" : "PAUSED"}</small><p className="timer-topic">{focusTarget ? `${focusTarget.subject} · ${focusTarget.title}` : "Choose one topic or begin a focus block."}</p></div>
            <div className="timer-actions"><button type="button" className="button button-primary timer-toggle" onClick={toggleTimer}>{timerRunning ? "Pause session" : seconds === 25 * 60 ? "Start session" : "Resume session"}<span aria-hidden="true">{timerRunning ? "Ⅱ" : "↗"}</span></button><button type="button" className="reset-button" onClick={resetTimer} aria-label="Reset focus timer">Reset</button></div>
            <p className="timer-hint">Take one topic in. Leave the rest outside.</p>
          </article>
        </div>
      </section>

      <section className="subjects-section" id="subjects" aria-labelledby="subjects-title">
        <div className="section-shell">
          <div className="section-heading subject-heading">
            <div><p className="section-kicker">SORT THE BIG STUFF INTO SMALL WINS</p><h2 id="subjects-title">Your subjects</h2></div>
            <label className="subject-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search subjects and topics</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a subject or topic…" /></label>
          </div>
          <form className="add-subject" onSubmit={addSubject}>
            <span className="add-mark" aria-hidden="true">+</span><label htmlFor="new-subject">Add a subject to your sprint</label><input id="new-subject" value={newSubject} onChange={(event) => setNewSubject(event.target.value)} maxLength={48} placeholder="e.g. Chemistry" disabled={subjects.length >= 12} /><button type="submit" disabled={!newSubject.trim() || subjects.length >= 12}>Add subject <span aria-hidden="true">↗</span></button>
          </form>
          <div className="subject-grid">
            {visibleSubjects.map((subject, index) => {
              const done = subject.topics.filter((topic) => topic.done).length;
              const progress = subject.topics.length ? Math.round((done / subject.topics.length) * 100) : 0;
              const minutesLeft = subject.topics.reduce((total, topic) => total + (topic.done ? 0 : topic.minutes), 0);
              return <article className="subject-card" key={subject.id} style={{ "--subject-color": subject.color } as CSSProperties}>
                <div className="subject-top"><span className="subject-index">0{index + 1}</span><button className="notes-link" type="button" onClick={() => { setSelectedNote(subject.id); document.getElementById("notes")?.scrollIntoView({ behavior: "smooth" }); }}>Quick notes ↗</button></div>
                <h3>{subject.name}</h3>
                <div className="progress-line" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>
                <p className="progress-copy">{done} of {subject.topics.length} topics checked off · {minutesLeft} min left</p>
                {subject.topics.length ? <ul className="topic-list">{subject.topics.map((topic) => <li key={topic.id} className={topic.done ? "topic-done" : ""}>
                  <button type="button" className="topic-check" aria-label={`${topic.done ? "Reopen" : "Complete"} ${topic.title}`} aria-pressed={topic.done} onClick={() => toggleTopic(subject.id, topic.id)}>{topic.done ? "✓" : ""}</button><span>{topic.title}</span><small>{topic.minutes}m</small>{!topic.done && <button type="button" className="focus-topic" aria-label={`Start a 25-minute focus session for ${topic.title}`} disabled={timerRunning} onClick={() => startTopicFocus(subject.name, topic.title)}>Focus</button>}
                </li>)}</ul> : <p className="empty-topics">Start with one topic you can finish in a sitting.</p>}
                <form className="add-topic" onSubmit={(event) => addTopic(event, subject.id)}><label className="sr-only" htmlFor={`topic-${subject.id}`}>Add topic to {subject.name}</label><input id={`topic-${subject.id}`} value={topicDrafts[subject.id] || ""} onChange={(event) => setTopicDrafts((current) => ({ ...current, [subject.id]: event.target.value }))} placeholder="Add a 25-minute topic…" maxLength={100} disabled={subject.topics.length >= 40} /><button type="submit" aria-label={`Add topic to ${subject.name}`} disabled={!topicDrafts[subject.id]?.trim() || subject.topics.length >= 40}>+</button></form>
              </article>;
            })}
            {query && !visibleSubjects.length && <div className="empty-search"><h3>No subject found.</h3><p>Try another word or clear your search.</p><button type="button" onClick={() => setQuery("")}>Clear search</button></div>}
            {!subjects.length && <div className="empty-search"><h3>A clean slate.</h3><p>Add your first subject above, then break it into small topics.</p></div>}
          </div>
        </div>
      </section>

      <section className="notes-section section-shell" id="notes" aria-labelledby="notes-title">
        <div className="notes-heading"><div><p className="section-kicker">GET IT OUT OF YOUR HEAD</p><h2 id="notes-title">Quick notes</h2></div><span className="notes-local">Saved on this device</span></div>
        {activeNote ? <div className="notes-paper"><div className="notes-toolbar"><label htmlFor="note-subject">For</label><select id="note-subject" value={activeNote.id} onChange={(event) => setSelectedNote(event.target.value)}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><span className="notes-count">{activeNote.note.length.toLocaleString()} / 2,000</span></div><textarea aria-label={`Quick notes for ${activeNote.name}`} value={activeNote.note} onChange={(event) => updateNote(event.target.value)} maxLength={2000} placeholder="Formulas, questions to revisit, or one thing you want to remember…" /><p className="notes-foot">Private to this browser. No account or cloud sync.</p></div> : <div className="notes-empty">Add a subject to start a quick note.</div>}
      </section>

      <footer className="footer section-shell"><a className="brand" href="#overview"><span className="brand-icon" aria-hidden="true">L<span>.</span></span><span>last minute<span className="brand-study">study</span></span></a><p>Make the next session count. Let the rest wait.</p><div className="backup-actions"><button type="button" onClick={downloadBackup}>Download backup</button><button type="button" onClick={() => backupInput.current?.click()}>Restore backup</button><input ref={backupInput} type="file" accept="application/json,.json" hidden onChange={restoreBackup} /></div><button type="button" onClick={clearWorkspace}>Clear this browser’s study data</button><span className="privacy-line">Your plan and notes stay on this device.</span></footer>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
    </main>
  );
}
