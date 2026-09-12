"use client";

import type React from "react";
import { ArrowRight, Award, BarChart3, BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileUp, Flag, GraduationCap, History, LayoutDashboard, ListChecks, LockKeyhole, LogOut, RotateCcw, ShieldCheck, Sparkles, Trophy, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { describeAnswerResult, explainCorrectAnswer, getCorrectOptionIds, hcipHuaweiPreset, isAnswerCorrect, normalizeQuestionCount, scoreAttempt, shuffleWithSeed } from "@/lib/exam-engine";
import { certifications, topics } from "@/lib/exam-catalog";
import type { AttemptAnswer, AttemptSummary, Candidate, ExamQuestion, ImportPreviewQuestion } from "@/types/exam";
import type { PracticeActivity, QuestionHistory } from "@/types/practice";
import { AdminLogin } from "@/components/admin-login";
import { ThemeToggle } from "@/lib/theme";

export type View = "dashboard" | "practice" | "exam-setup" | "exam" | "results" | "admin";

const storageKey = "certly-active-attempt";

// Shared "production platform" style tokens — driven by CSS variables so the
// whole app follows the light/dark theme toggle.
const platformCard = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(15,17,25,0.04)] transition-colors duration-300";
const platformInput = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";
const platformPrimaryBtn = "inline-flex items-center justify-center gap-2 rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-[filter] hover:bg-[image:var(--gradient-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
const platformSecondaryBtn = "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]";

type AttemptHistoryItem = {
  id: string;
  submittedAt: string;
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  durationSeconds: number;
};

type PracticeQuestionState = {
  selected: string[];
  revealed: boolean;
  feedback: ExamQuestion | null;
};

const emptyPracticeState: PracticeQuestionState = { selected: [], revealed: false, feedback: null };

export function CertlyApp({ initialView = "dashboard" }: { initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [candidate, setCandidate] = useState<Candidate>({ name: "", email: "" });
  const [selectedTopic, setSelectedTopic] = useState("Mixed Mock");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceStates, setPracticeStates] = useState<Record<string, PracticeQuestionState>>({});
  const [practiceActivity, setPracticeActivity] = useState<PracticeActivity | null>(null);
  const [practiceActivityStatus, setPracticeActivityStatus] = useState("Loading activity...");
  const [practiceChecking, setPracticeChecking] = useState(false);
  const [practiceStatus, setPracticeStatus] = useState("");
  const [answers, setAnswers] = useState<AttemptAnswer[]>([]);
  const [timed, setTimed] = useState(true);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [remainingSeconds, setRemainingSeconds] = useState(hcipHuaweiPreset.durationMinutes * 60);
  const [saveStatus, setSaveStatus] = useState("");
  const [questionBank, setQuestionBank] = useState<ExamQuestion[]>([]);
  const [attemptHistory, setAttemptHistory] = useState<AttemptHistoryItem[]>([]);
  const [resultSummary, setResultSummary] = useState<AttemptSummary | null>(null);
  const [examSeed, setExamSeed] = useState(() => createSessionSeed());
  const [practiceSeed, setPracticeSeed] = useState(() => createSessionSeed());
  const [previousExamFirst, setPreviousExamFirst] = useState(() => readLastQuestion("certly-last-exam-first"));
  const [previousPracticeFirst, setPreviousPracticeFirst] = useState(() => readLastQuestion("certly-last-practice-first"));
  const questionOpenedAt = useRef(0);
  const submittingAttempt = useRef(false);
  const practiceCheckInFlight = useRef(false);

  const examQuestions = useMemo(() => {
    const count = normalizeQuestionCount(questionBank.length, hcipHuaweiPreset.questionCount);
    return avoidPreviousFirst(shuffleWithSeed(questionBank, examSeed), previousExamFirst).slice(0, count);
  }, [examSeed, previousExamFirst, questionBank]);
  const practiceQuestions = useMemo(() => {
    const topicQuestions = selectedTopic === "Mixed Mock" ? questionBank : questionBank.filter((question) => question.topic === selectedTopic);
    return avoidPreviousFirst(shuffleWithSeed(topicQuestions, practiceSeed), previousPracticeFirst);
  }, [practiceSeed, previousPracticeFirst, questionBank, selectedTopic]);
  const summary = useMemo(() => resultSummary ?? scoreAttempt(examQuestions, []), [examQuestions, resultSummary]);
  const activeQuestion = examQuestions[questionIndex];
  const practiceQuestion = practiceQuestions[practiceIndex] ?? questionBank[0];
  const practiceState = practiceQuestion ? practiceStates[practiceQuestion.id] ?? emptyPracticeState : emptyPracticeState;

  useEffect(() => {
    void fetch("/api/questions")
      .then((response) => response.json())
      .then((data: { questions?: ExamQuestion[] }) => {
        if (data.questions?.length) setQuestionBank(data.questions);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const firstId = examQuestions[0]?.id;
    if (!firstId) return;
    window.localStorage.setItem("certly-last-exam-first", firstId);
  }, [examQuestions]);

  useEffect(() => {
    const firstId = practiceQuestions[0]?.id;
    if (!firstId) return;
    window.localStorage.setItem("certly-last-practice-first", firstId);
  }, [practiceQuestions]);

  useEffect(() => {
    if (view !== "practice") return;
    const controller = new AbortController();
    void fetch("/api/practice/activity", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { activity?: PracticeActivity; error?: string };
        if (!response.ok || !data.activity) throw new Error(data.error ?? "Practice activity could not be loaded.");
        setPracticeActivity(data.activity);
        setPracticeActivityStatus("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPracticeActivityStatus("Readiness and question history are temporarily unavailable.");
      });
    return () => controller.abort();
  }, [view]);

  useEffect(() => {
    if (!startedAt) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify({ candidate, answers, startedAt, marked: [...marked] }));
  }, [answers, candidate, marked, startedAt]);

  function updateAnswer(question: ExamQuestion, optionId: string) {
    setAnswers((current) => {
      const existing = current.find((answer) => answer.questionId === question.id);
      const previous = existing?.selectedOptionIds ?? [];
      const selectedOptionIds = question.type === "multiple" ? toggleSelection(previous, optionId) : [optionId];
      return [
        ...current.filter((answer) => answer.questionId !== question.id),
        { questionId: question.id, selectedOptionIds, timeSpentSeconds: existing?.timeSpentSeconds ?? 0, markedForReview: marked.has(question.id) },
      ];
    });
  }

  function startExam() {
    if (questionBank.length === 0) return;
    setPreviousExamFirst(examQuestions[0]?.id ?? previousExamFirst);
    setAnswers([]);
    setMarked(new Set());
    setQuestionIndex(0);
    setStartedAt(new Date().toISOString());
    setRemainingSeconds(hcipHuaweiPreset.durationMinutes * 60);
    setSaveStatus("");
    setResultSummary(null);
    setExamSeed(createSessionSeed());
    questionOpenedAt.current = Date.now();
    setView("exam");
  }

  function startPractice() {
    setPreviousPracticeFirst(practiceQuestions[0]?.id ?? previousPracticeFirst);
    setPracticeSeed(createSessionSeed());
    setPracticeIndex(0);
    setPracticeStates({});
    setPracticeStatus("");
    setView("practice");
  }

  function resetAttempt() {
    window.sessionStorage.removeItem(storageKey);
    setAnswers([]);
    setMarked(new Set());
    setStartedAt(null);
    setResultSummary(null);
    setQuestionIndex(0);
    setView("exam-setup");
  }

  const finishExam = useCallback(async () => {
    if (!startedAt || !activeQuestion || submittingAttempt.current) return;
    submittingAttempt.current = true;
    const elapsed = Math.max(1, Math.round((Date.now() - questionOpenedAt.current) / 1000));
    const finalAnswers = addQuestionTime(answers, activeQuestion.id, elapsed, marked.has(activeQuestion.id));
    const submittedAt = new Date().toISOString();

    setAnswers(finalAnswers);
    setSaveStatus("Scoring attempt...");

    try {
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate,
          certificationId: hcipHuaweiPreset.certificationId,
          mode: "exam",
          timed,
          startedAt,
          submittedAt,
          questionIds: examQuestions.map((question) => question.id),
          answers: finalAnswers,
        }),
      });
      const data = (await response.json()) as { error?: string; saved?: boolean; attemptId?: string | null; summary?: AttemptSummary };
      if (!response.ok || !data.summary) throw new Error(data.error ?? "The attempt could not be scored.");
      setResultSummary(data.summary);
      setStartedAt(null);
      window.sessionStorage.removeItem(storageKey);
      setView("results");
      setSaveStatus(data.saved ? "Attempt saved." : "Result shown, but attempt history could not be saved.");
      const historyItem: AttemptHistoryItem = {
        id: data.attemptId ?? `local-${Date.now()}`,
        submittedAt,
        score: data.summary.score,
        passed: data.summary.passed,
        correct: data.summary.correct,
        total: data.summary.total,
        durationSeconds: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)),
      };
      setAttemptHistory((current) => [historyItem, ...current].slice(0, 10));
    } catch {
      setSaveStatus("The attempt could not be scored. Check your connection and submit again.");
    } finally {
      submittingAttempt.current = false;
    }
  }, [activeQuestion, answers, candidate, examQuestions, marked, startedAt, timed]);

  async function checkPracticeAnswer() {
    if (!practiceQuestion || practiceState.selected.length === 0 || practiceCheckInFlight.current || practiceState.revealed) return;
    practiceCheckInFlight.current = true;
    setPracticeChecking(true);
    setPracticeStatus("");
    try {
      const response = await fetch("/api/practice/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: practiceQuestion.id, selectedOptionIds: practiceState.selected }),
      });
      const data = (await response.json()) as { error?: string; question?: ExamQuestion; activity?: PracticeActivity };
      if (!response.ok || !data.question) throw new Error(data.error ?? "Answer could not be checked.");
      setPracticeStates((current) => ({
        ...current,
        [practiceQuestion.id]: { ...practiceState, feedback: data.question ?? null, revealed: true },
      }));
      if (data.activity) {
        setPracticeActivity(data.activity);
        setPracticeActivityStatus("");
      }
    } catch {
      setPracticeStatus("Answer could not be checked. Try again.");
    } finally {
      practiceCheckInFlight.current = false;
      setPracticeChecking(false);
    }
  }

  function selectPracticeOption(optionId: string) {
    if (!practiceQuestion || practiceState.revealed) return;
    const selected = practiceQuestion.type === "multiple"
      ? toggleSelection(practiceState.selected, optionId)
      : [optionId];
    setPracticeStates((current) => ({
      ...current,
      [practiceQuestion.id]: { ...practiceState, selected },
    }));
  }

  useEffect(() => {
    if (view !== "exam" || !timed || !startedAt) return;
    const updateTimer = () => {
      const deadline = new Date(startedAt).getTime() + hcipHuaweiPreset.durationMinutes * 60 * 1000;
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next === 0) void finishExam();
    };
    updateTimer();
    const interval = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(interval);
  }, [finishExam, startedAt, timed, view]);

  function moveToQuestion(nextIndex: number) {
    if (!activeQuestion) return;
    const elapsed = Math.max(1, Math.round((Date.now() - questionOpenedAt.current) / 1000));
    setAnswers((current) => addQuestionTime(current, activeQuestion.id, elapsed, marked.has(activeQuestion.id)));
    questionOpenedAt.current = Date.now();
    setQuestionIndex(nextIndex);
  }

  const isLanding = view === "dashboard";

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
      <header
        className={clsx(
          "sticky top-0 z-40 border-b backdrop-blur-xl transition-colors duration-300",
          isLanding ? "border-[var(--card-border)]" : "border-[var(--border)]"
        )}
        style={{ background: isLanding ? "var(--header-bg)" : "var(--surface)" }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/certly-mark.png" alt="" className="h-9 w-9" width={36} height={36} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-faint)]">Certification simulator</p>
              <h1 className="-mt-0.5 text-lg font-bold tracking-tight text-[var(--text)]">Certly</h1>
            </div>
          </div>
          {view !== "exam" && (
            <div className="flex items-center gap-2">
              <nav className="flex flex-wrap gap-1.5">
                <Nav active={view === "dashboard"} icon={<LayoutDashboard />} onClick={() => setView("dashboard")}>Home</Nav>
                <Nav active={view === "practice"} icon={<BookOpenCheck />} onClick={startPractice}>Practice</Nav>
                <Nav active={view === "exam-setup"} icon={<ShieldCheck />} onClick={() => setView("exam-setup")}>Exam mode</Nav>
                <Nav active={view === "admin"} icon={<LockKeyhole />} onClick={() => setView("admin")}>Admin</Nav>
              </nav>
              <ThemeToggle />
            </div>
          )}
        </div>
      </header>

      {view === "dashboard" && <Landing candidate={candidate} setCandidate={setCandidate} summary={summary} attemptHistory={attemptHistory} questionBank={questionBank} goExam={() => setView("exam-setup")} goPractice={startPractice} />}
      {view === "practice" && practiceQuestion && (
        <PracticeMode
          topic={selectedTopic}
          setTopic={(topic) => { setSelectedTopic(topic); setPracticeIndex(0); setPracticeStates({}); setPracticeStatus(""); }}
          question={practiceQuestion}
          index={practiceIndex}
          total={practiceQuestions.length}
          selected={practiceState.selected}
          onSelect={selectPracticeOption}
          revealed={practiceState.revealed}
          feedback={practiceState.feedback}
          activity={practiceActivity}
          activityStatus={practiceActivityStatus}
          history={practiceActivity?.historyByQuestion[practiceQuestion.id]}
          checking={practiceChecking}
          status={practiceStatus}
          onCheck={() => void checkPracticeAnswer()}
          previous={() => { setPracticeIndex((current) => Math.max(0, current - 1)); setPracticeStatus(""); }}
          next={() => { setPracticeIndex((current) => Math.min(practiceQuestions.length - 1, current + 1)); setPracticeStatus(""); }}
        />
      )}
      {view === "practice" && !practiceQuestion && <QuestionBankUnavailable />}
      {view === "exam-setup" && <ExamSetup candidate={candidate} setCandidate={setCandidate} timed={timed} setTimed={setTimed} onStart={startExam} hasDraft={Boolean(startedAt)} onReset={resetAttempt} ready={questionBank.length > 0} />}
      {view === "exam" && activeQuestion && (
        <ExamMode
          question={activeQuestion}
          questions={examQuestions}
          index={questionIndex}
          total={examQuestions.length}
          answers={answers}
          marked={marked}
          timed={timed}
          onSelect={updateAnswer}
          remainingSeconds={remainingSeconds}
          onJump={moveToQuestion}
          onPrevious={() => moveToQuestion(Math.max(0, questionIndex - 1))}
          onNext={() => moveToQuestion(Math.min(examQuestions.length - 1, questionIndex + 1))}
          onFinish={() => void finishExam()}
          status={saveStatus}
          onToggleMark={(questionId) => setMarked((current) => { const next = new Set(current); if (next.has(questionId)) next.delete(questionId); else next.add(questionId); return next; })}
        />
      )}
      {view === "results" && resultSummary && <Results summary={resultSummary} saveStatus={saveStatus} onRetake={resetAttempt} />}
      {view === "admin" && <AdminImport />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Landing — fluid, animated marketing-style home (shares the login palette)
// ---------------------------------------------------------------------------

function Landing({ candidate, setCandidate, summary, attemptHistory, questionBank, goExam, goPractice }: { candidate: Candidate; setCandidate: (candidate: Candidate) => void; summary: ReturnType<typeof scoreAttempt>; attemptHistory: AttemptHistoryItem[]; questionBank: ExamQuestion[]; goExam: () => void; goPractice: () => void }) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="blob-anim absolute -left-32 top-[-12%] h-96 w-96 rounded-full blur-[110px] transition-opacity duration-500" style={{ background: "var(--blob-1)", opacity: "var(--blob-opacity)" }} />
        <div className="blob-anim-delay absolute right-[-12%] top-[8%] h-[28rem] w-[28rem] rounded-full blur-[120px] transition-opacity duration-500" style={{ background: "var(--blob-2)", opacity: "var(--blob-opacity)" }} />
        <div className="blob-anim-slow absolute bottom-[-18%] left-1/4 h-[26rem] w-[26rem] rounded-full blur-[120px] transition-opacity duration-500" style={{ background: "var(--blob-3)", opacity: "calc(var(--blob-opacity) * 0.75)" }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--hero-grid)_1px,transparent_0)] [background-size:26px_26px]" />
      </div>

      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:pt-20">
        <div className="login-card-enter grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--input-bg)] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              <Sparkles className="float-icon h-3 w-3 text-[var(--turquoise)]" /> {certifications[0].name}
            </span>
            <h2 className="animate-gradient-text mt-5 max-w-2xl bg-clip-text text-4xl font-bold leading-[1.1] tracking-tight text-transparent sm:text-5xl" style={{ backgroundImage: "var(--gradient-hero)" }}>
              Practice like a learner. Sit the mock like it&rsquo;s Pearson&nbsp;VUE day.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--text-soft)]">
              Certly runs the HCIP-Datacenter Facility Deployment preset end to end: {hcipHuaweiPreset.questionCount} questions, 90 minutes, all-or-nothing multiple-answer scoring, an instant score report, and a full review — the same rhythm as the real testing center.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-4 text-sm text-[var(--text-soft)]">
              <span className="fade-up inline-flex items-center gap-1.5" style={{ animationDelay: "80ms" }}><CheckCircle2 className="h-4 w-4 text-[var(--turquoise)]" /> Timed, proctor-style pacing</span>
              <span className="fade-up inline-flex items-center gap-1.5" style={{ animationDelay: "160ms" }}><CheckCircle2 className="h-4 w-4 text-[var(--turquoise)]" /> Instant 1000-point scoring</span>
              <span className="fade-up inline-flex items-center gap-1.5" style={{ animationDelay: "240ms" }}><CheckCircle2 className="h-4 w-4 text-[var(--turquoise)]" /> Full answer review</span>
            </div>

            {attemptHistory.length > 0 && (
              <div className="mt-9 border-t border-[var(--card-border)] pt-6">
                <h3 className="text-sm font-semibold text-[var(--text)]">Your recent attempts</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {attemptHistory.slice(0, 4).map((attempt, index) => (
                    <div
                      key={attempt.id}
                      className="fade-up flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] p-3 text-sm backdrop-blur"
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
                      <span className="text-[var(--text-faint)]">{new Date(attempt.submittedAt).toLocaleDateString()}</span>
                      <span className="text-[var(--text-soft)]">{attempt.correct}/{attempt.total}</span>
                      <strong className={attempt.passed ? "text-[var(--success)]" : "text-[var(--danger)]"}>{attempt.score}/1000</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <div
              className="relative overflow-hidden rounded-[28px] border p-7 backdrop-blur-2xl transition-colors duration-500"
              style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", boxShadow: "var(--card-shadow)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">Get started</p>
              <h3 className="mt-2 text-xl font-bold text-[var(--text)]">Set up your candidate profile</h3>
              <div className="mt-5 grid gap-3.5">
                <GlassInput label="Candidate name" value={candidate.name} onChange={(name) => setCandidate({ ...candidate, name })} placeholder="Your name" />
                <GlassInput label="Email" value={candidate.email} onChange={(email) => setCandidate({ ...candidate, email })} placeholder="you@example.com" type="email" />
              </div>
              <div className="mt-6 grid gap-2.5">
                <button
                  className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-[image:var(--gradient-primary)] px-4 py-3 text-sm font-bold text-white transition-[background-image] duration-300 hover:bg-[image:var(--gradient-primary-hover)] active:scale-[0.98]"
                  onClick={goExam}
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-[shine_1.1s_ease]" />
                  <span className="relative inline-flex items-center gap-1.5">Start exam setup <ArrowRight className="h-4 w-4" /></span>
                </button>
                <button
                  className="rounded-xl border px-4 py-3 text-sm font-semibold transition-colors"
                  style={{ borderColor: "var(--card-border)", background: "var(--input-bg)", color: "var(--text)" }}
                  onClick={goPractice}
                >
                  Open practice mode
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          <GlassMetric icon={<Trophy className="h-4 w-4" />} label="Huawei-style score" value={`${summary.score}/1000`} />
          <GlassMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Pass threshold" value="600" />
          <GlassMetric icon={<Clock3 className="h-4 w-4" />} label="Full mock duration" value="90 min" />
        </div>

        <div
          className="mt-6 rounded-[24px] border p-6 backdrop-blur-xl transition-colors duration-500"
          style={{ borderColor: "var(--card-border)", background: "var(--input-bg)" }}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-soft)]"><BarChart3 className="h-4 w-4" /> Current question bank</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {topics.slice(0, 6).map((topic) => (
              <div key={topic} className="flex items-center justify-between border-b border-[var(--card-border)] py-2 text-sm text-[var(--text-soft)]">
                <span>{topic}</span>
                <span className="text-[var(--text-faint)]">{questionBank.filter((question) => question.topic === topic).length} questions</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function GlassInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{label}</span>
      <input
        className="rounded-xl border px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:ring-4"
        style={{ borderColor: "var(--input-border)", background: "var(--input-bg)" }}
        onFocus={(event) => { event.currentTarget.style.borderColor = "var(--accent)"; }}
        onBlur={(event) => { event.currentTarget.style.borderColor = "var(--input-border)"; }}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function GlassMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="rounded-2xl border p-5 backdrop-blur-xl transition-colors duration-500"
      style={{ borderColor: "var(--card-border)", background: "var(--input-bg)" }}
    >
      <div className="flex items-center gap-2 text-[var(--accent)] [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <p className="mt-3 text-sm text-[var(--text-faint)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice / Exam-setup / Exam / Results / Admin — "production platform"
// (Pearson VUE style: neutral surfaces, structured cards, disciplined accent use)
// ---------------------------------------------------------------------------

function PracticeMode(props: { topic: string; setTopic: (topic: string) => void; question: ExamQuestion; index: number; total: number; selected: string[]; onSelect: (optionId: string) => void; revealed: boolean; feedback: ExamQuestion | null; activity: PracticeActivity | null; activityStatus: string; history?: QuestionHistory; checking: boolean; status: string; onCheck: () => void; previous: () => void; next: () => void }) {
  const feedbackQuestion = props.feedback ?? props.question;
  const correct = props.revealed && Boolean(props.feedback) && isAnswerCorrect(feedbackQuestion, props.selected);
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Practice mode</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Immediate feedback and explanations</h2>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          Topic
          <select className={clsx(platformInput, "cursor-pointer")} value={props.topic} onChange={(event) => props.setTopic(event.target.value)}>
            <option>Mixed Mock</option>
            {topics.map((topic) => <option key={topic}>{topic}</option>)}
          </select>
        </label>
      </div>
      <ReadinessCard activity={props.activity} status={props.activityStatus} />
      <div className="mb-3 mt-5 flex min-h-5 items-center gap-1.5 text-xs text-[var(--text-faint)]">
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        <QuestionHistoryIndicator history={props.history} />
      </div>
      <QuestionPanel question={feedbackQuestion} selected={props.selected} reveal={props.revealed} onSelect={props.onSelect} eyebrow={`Question ${props.index + 1} of ${props.total}`} />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button className={platformSecondaryBtn} disabled={props.index === 0} onClick={props.previous}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <div className="flex flex-wrap justify-end gap-3">
          <button className={platformPrimaryBtn} disabled={props.selected.length === 0 || props.checking || props.revealed} onClick={props.onCheck}>{props.checking ? "Checking..." : props.revealed ? "Answer checked" : "Check answer"}</button>
          <button className={platformSecondaryBtn} disabled={props.index === props.total - 1} onClick={props.next}>
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      {props.status && <p aria-live="polite" className="mt-3 text-sm text-[var(--danger)]">{props.status}</p>}
      {props.revealed && props.feedback && <Feedback question={props.feedback} selected={props.selected} correct={correct} />}
    </section>
  );
}

function ReadinessCard({ activity, status }: { activity: PracticeActivity | null; status: string }) {
  const readiness = activity?.readiness;
  const score = readiness?.score ?? 0;
  const metrics = readiness?.metrics;
  const metricRows = [
    ["Knowledge Mastery", metrics?.knowledgeMastery],
    ["Topic Coverage", metrics?.topicCoverage],
    ["Recent Accuracy", metrics?.recentAccuracy],
    ["Weak-Area Performance", metrics?.weakAreaPerformance],
    ["Mock Exam Performance", metrics?.mockExamPerformance],
  ] as const;

  return (
    <section className={clsx(platformCard, "p-5 sm:p-6")} aria-labelledby="exam-readiness-title">
      <div className="grid gap-6 md:grid-cols-[160px_1fr] md:items-center">
        <div className="flex flex-col items-center text-center">
          <p id="exam-readiness-title" className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Exam readiness</p>
          <div
            className="mt-3 grid h-32 w-32 place-items-center rounded-full p-2"
            style={{ background: `conic-gradient(var(--turquoise) ${score * 3.6}deg, var(--border) 0deg)` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={readiness ? score : undefined}
            aria-label="Exam readiness"
          >
            <div className="grid h-full w-full place-content-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
              <span className="text-3xl font-bold tabular-nums text-[var(--text)]">{readiness ? `${score}%` : "--"}</span>
              <span className="mt-0.5 text-xs font-semibold text-[var(--text-soft)]">{readiness?.state ?? "Calculating"}</span>
            </div>
          </div>
        </div>
        <div>
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {metricRows.map(([label, value]) => (
              <div key={label}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-[var(--text-soft)]">{label}</span>
                  <span className="font-bold tabular-nums text-[var(--text)]">{value === undefined ? "--" : `${value}%`}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                  <div className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-[width] duration-500" style={{ width: `${value ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]">Recommended next</p>
            {readiness?.recommendedNext.length ? (
              <ul className="mt-2 grid gap-1.5 text-sm text-[var(--text)] sm:grid-cols-3">
                {readiness.recommendedNext.map((topic) => <li key={topic} className="font-medium">{topic}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-faint)]">No practice performance recorded yet.</p>
            )}
          </div>
          {status && <p aria-live="polite" className="mt-3 text-xs text-[var(--text-faint)]">{status}</p>}
        </div>
      </div>
    </section>
  );
}

function QuestionHistoryIndicator({ history }: { history?: QuestionHistory }) {
  if (!history) return <span>Not attempted yet</span>;
  return (
    <span>
      Attempted {history.totalAttempts}&times; &bull; Correct {history.correctAttempts}/{history.totalAttempts} &bull; Last: {formatHistoryDate(history.lastAttemptedAt)} &bull; Previous: {history.previousCorrect ? "Correct" : "Incorrect"}
    </span>
  );
}

function ExamSetup({ candidate, setCandidate, timed, setTimed, onStart, hasDraft, onReset, ready }: { candidate: Candidate; setCandidate: (candidate: Candidate) => void; timed: boolean; setTimed: (timed: boolean) => void; onStart: () => void; hasDraft: boolean; onReset: () => void; ready: boolean }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className={clsx(platformCard, "p-6 sm:p-8")}>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]"><GraduationCap className="h-4 w-4" /> Exam mode</div>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Huawei-style mock exam setup</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">Configured to mirror the official test-center experience — fixed question count, strict timing, and an all-or-nothing scoring model.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Metric icon={<ListChecks />} label="Questions" value={`${hcipHuaweiPreset.questionCount} preset`} />
          <Metric icon={<Clock3 />} label="Timer" value={timed ? "90 min" : "Untimed"} />
          <Metric icon={<Trophy />} label="Score scale" value="1000" />
          <Metric icon={<ShieldCheck />} label="Pass mark" value="600" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <TextInput label="Candidate name" value={candidate.name} onChange={(name) => setCandidate({ ...candidate, name })} placeholder="Your name" />
          <TextInput label="Email" value={candidate.email} onChange={(email) => setCandidate({ ...candidate, email })} placeholder="you@example.com" />
        </div>
        <label className="mt-5 flex max-w-sm items-center justify-between rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] p-3 text-sm font-semibold">
          Timed exam
          <input type="checkbox" checked={timed} onChange={(event) => setTimed(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        </label>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className={platformPrimaryBtn} disabled={!candidate.name.trim() || !ready} onClick={onStart}>Start mock exam</button>
          {hasDraft && <button className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" }} onClick={onReset}><RotateCcw className="h-4 w-4" />Start again</button>}
        </div>
        {(!candidate.name.trim() || !ready) && <p className="mt-3 text-sm text-[var(--text-soft)]">{ready ? "Enter the candidate name to start." : "The question bank is loading. Try again in a moment."}</p>}
      </div>
    </section>
  );
}

function ExamMode(props: { question: ExamQuestion; questions: ExamQuestion[]; index: number; total: number; answers: AttemptAnswer[]; marked: Set<string>; timed: boolean; remainingSeconds: number; status: string; onSelect: (question: ExamQuestion, optionId: string) => void; onPrevious: () => void; onNext: () => void; onJump: (index: number) => void; onFinish: () => void; onToggleMark: (questionId: string) => void }) {
  const selected = props.answers.find((item) => item.questionId === props.question.id)?.selectedOptionIds ?? [];
  const lowTime = props.timed && props.remainingSeconds <= 300;
  return (
    <section className="grid min-h-[calc(100vh-73px)] lg:grid-cols-[1fr_320px]">
      <div className="px-4 py-6 sm:px-6">
        <div className={clsx(platformCard, "mb-4 flex flex-wrap items-center justify-between gap-3 p-4")}>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Exam in progress</p>
            <h2 className="text-xl font-bold">Question {props.index + 1} of {props.total}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div
              aria-live="polite"
              className="rounded-lg border px-3 py-2 text-sm font-bold tabular-nums"
              style={lowTime ? { borderColor: "var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" } : { borderColor: "var(--border-strong)", background: "var(--surface-2)", color: "var(--text)" }}
            >
              {props.timed ? formatTime(props.remainingSeconds) : "Untimed"}
            </div>
            <button
              className={clsx(platformSecondaryBtn, "py-2")}
              style={props.marked.has(props.question.id) ? { borderColor: "var(--warning)", background: "var(--warning-soft)", color: "var(--warning)" } : undefined}
              onClick={() => props.onToggleMark(props.question.id)}
            >
              <Flag className="h-4 w-4" />{props.marked.has(props.question.id) ? "Marked" : "Mark"}
            </button>
          </div>
        </div>
        <QuestionPanel question={props.question} selected={selected} reveal={false} onSelect={(optionId) => props.onSelect(props.question, optionId)} eyebrow={props.question.type === "multiple" ? "Select all correct answers" : "Select one answer"} />
        {props.status && <p aria-live="polite" className="mt-3 text-sm text-[var(--text-soft)]">{props.status}</p>}
        <div className="mt-5 flex justify-between gap-3">
          <button className={platformSecondaryBtn} onClick={props.onPrevious}>Previous</button>
          {props.index === props.total - 1
            ? <button className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors" style={{ background: "var(--success)" }} onClick={props.onFinish}>Submit exam</button>
            : <button className={platformPrimaryBtn} onClick={props.onNext}>Next</button>}
        </div>
      </div>
      <aside className={clsx(platformCard, "m-4 rounded-2xl p-5 lg:ml-0")}>
        <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]">Question navigator</h3>
        <div className="mt-4 grid grid-cols-6 gap-2">
          {props.questions.map((question, index) => {
            const answered = props.answers.some((item) => item.questionId === question.id && item.selectedOptionIds.length > 0);
            const isMarked = props.marked.has(question.id);
            const isCurrent = index === props.index;
            return (
              <button
                key={question.id}
                className="h-10 rounded-lg border text-sm font-bold transition-colors"
                style={{
                  borderColor: isCurrent ? "var(--accent)" : answered ? "var(--success-border)" : "var(--border)",
                  background: isCurrent ? "var(--accent-soft)" : answered ? "var(--success-soft)" : "var(--surface)",
                  color: isCurrent ? "var(--accent)" : answered ? "var(--success)" : "var(--text-soft)",
                  boxShadow: isMarked ? "0 0 0 2px var(--warning)" : "none",
                }}
                onClick={() => props.onJump(index)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-1.5 text-xs text-[var(--text-soft)]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /> Current</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--success)" }} /> Answered</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ boxShadow: "0 0 0 2px var(--warning)" }} /> Marked for review</span>
        </div>
      </aside>
    </section>
  );
}

function Results({ summary, saveStatus, onRetake }: { summary: AttemptSummary; saveStatus: string; onRetake: () => void }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className={clsx(platformCard, "p-6 text-center sm:text-left")}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Immediate result</p>
          <div
            className="mt-4 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold"
            style={summary.passed ? { background: "var(--success-soft)", color: "var(--success)", borderColor: "var(--success-border)" } : { background: "var(--danger-soft)", color: "var(--danger)", borderColor: "var(--danger-border)" }}
          >
            {summary.passed ? <Award className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {summary.passed ? "Pass" : "Fail"}
          </div>
          <h2 className="mt-3 text-5xl font-black tracking-tight">{summary.score}<span className="text-2xl font-bold text-[var(--text-soft)]">/1000</span></h2>
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <MiniStat label="Correct" value={summary.correct} />
            <MiniStat label="Wrong" value={summary.incorrect} />
            <MiniStat label="Blank" value={summary.unanswered} />
          </div>
          {saveStatus && <p className="mt-4 text-sm text-[var(--text-soft)]">{saveStatus}</p>}
          <button className={clsx(platformPrimaryBtn, "mt-6 w-full")} onClick={onRetake}>Retake exam</button>
        </div>
        <div className={clsx(platformCard, "p-6")}>
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]">Weak topic analysis</h3>
          <div className="mt-4 space-y-3.5">{summary.byTopic.map((topic) => <Progress key={topic.topic} label={`${topic.topic} — ${topic.status}`} value={topic.percent} />)}</div>
        </div>
      </div>
      <div className={clsx(platformCard, "mt-6 p-6")}>
        <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]">Full review</h3>
        <div className="mt-4 grid gap-4">
          {summary.results.map((result, index) => {
            const question = result.question;
            return (
              <div key={question.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">Question {index + 1}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-soft)]">{result.timeSpentSeconds}s</span>
                    <span className="rounded-full border px-3 py-1 text-xs font-bold" style={result.isCorrect ? { background: "var(--success-soft)", color: "var(--success)", borderColor: "var(--success-border)" } : { background: "var(--danger-soft)", color: "var(--danger)", borderColor: "var(--danger-border)" }}>{result.isCorrect ? "Correct" : "Review"}</span>
                  </div>
                </div>
                <p className="text-sm leading-6">{question.text}</p>
                <p className="mt-3 text-sm text-[var(--text-soft)]">Correct answer: {getCorrectOptionIds(question).map((id) => question.options.find((option) => option.id === id)?.label).join(", ")}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-soft)]">{question.explanation}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function QuestionBankUnavailable() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className={clsx(platformCard, "p-6 text-sm text-[var(--text-soft)]")}>
        The question bank is loading. Try again in a moment.
      </div>
    </section>
  );
}

function AdminImport() {
  const [batches, setBatches] = useState<Array<{ importId: string; fileName: string; questions: ImportPreviewQuestion[] }>>([]);
  const [status, setStatus] = useState("Upload CSV or PDF to preview extracted questions before import.");
  const [auth, setAuth] = useState<"loading" | "guest" | "admin">("loading");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const preview = batches.flatMap((batch) => batch.questions.map((question) => ({ ...question, fileName: batch.fileName })));

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data: { authenticated: boolean; user?: { name: string } }) => {
        setAuth(data.authenticated ? "admin" : "guest");
        setAdminName(data.user?.name ?? "");
      })
      .catch(() => setAuth("guest"));
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("Signing in...");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { user?: { name: string }; error?: string };
      if (!response.ok) {
        setStatus(data.error ?? "Sign-in failed.");
        return;
      }
      setAuth("admin");
      setAdminName(data.user?.name ?? "Admin");
      setPassword("");
      setStatus("Signed in. Choose a file to begin.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "DELETE" });
    setAuth("guest");
    setBatches([]);
    setStatus("Signed out.");
    setBusy(false);
  }

  async function uploadFiles(selectedFiles: File[]) {
    const files = selectedFiles.slice(0, 10);
    if (files.length === 0) return;
    setBusy(true);
    const added: Array<{ importId: string; fileName: string; questions: ImportPreviewQuestion[] }> = [];
    const errors: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setStatus(`Parsing ${index + 1} of ${files.length}: ${file.name}`);
        const formData = new FormData();
        formData.set("file", file);
        try {
          const response = await fetch("/api/import", { method: "POST", body: formData });
          let data: { importId?: string; questions?: ImportPreviewQuestion[]; error?: string } = {};
          try {
            data = (await response.json()) as typeof data;
          } catch {
            data.error = response.status === 413
              ? "the server rejected the file size."
              : `the import service returned HTTP ${response.status}.`;
          }
          if (response.status === 401) {
            setAuth("guest");
            errors.push(`${file.name}: admin sign-in is required.`);
            break;
          }
          if (!response.ok || !data.importId || !data.questions?.length) {
            errors.push(`${file.name}: ${data.error ?? "no valid questions found."}`);
            continue;
          }
          added.push({ importId: data.importId, fileName: file.name, questions: data.questions });
        } catch {
          errors.push(`${file.name}: the connection ended before the import service responded.`);
        }
      }
      if (added.length) setBatches((current) => [...current, ...added]);
      const detected = added.reduce((total, batch) => total + batch.questions.length, 0);
      const summary = `Added ${added.length} file${added.length === 1 ? "" : "s"} with ${detected} question${detected === 1 ? "" : "s"}.`;
      setStatus(errors.length ? `${summary} ${errors.join(" ")}` : `${summary} Review before importing.`);
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (batches.length === 0) return;
    setBusy(true);
    setStatus("Importing reviewed questions...");
    const failed: typeof batches = [];
    const errors: string[] = [];
    let importedCount = 0;
    try {
      for (const batch of batches) {
        const response = await fetch(`/api/import/${batch.importId}/commit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questions: batch.questions }),
        });
        const data = (await response.json()) as { importedCount?: number; error?: string };
        if (response.status === 401) setAuth("guest");
        if (!response.ok) {
          failed.push(batch);
          errors.push(`${batch.fileName}: ${data.error ?? "import failed."}`);
        } else {
          importedCount += data.importedCount ?? 0;
        }
      }
      setBatches(failed);
      setStatus(errors.length
        ? `Imported ${importedCount} questions. ${errors.join(" ")}`
        : `Imported ${importedCount} questions into Appwrite.`);
    } catch {
      setStatus("Import failed. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (auth === "loading") {
    return <section className="mx-auto max-w-4xl px-4 py-12 text-sm text-[var(--text-soft)] sm:px-6">Checking admin access...</section>;
  }

  if (auth === "guest") {
    return (
      <AdminLogin
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        busy={busy}
        status={status}
        onSubmit={login}
      />
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className={clsx(platformCard, "p-6")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><FileUp className="h-4.5 w-4.5" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Admin import</p>
              <h2 className="text-2xl font-bold tracking-tight">PDF and CSV question intake</h2>
            </div>
          </div>
          <button className={clsx(platformSecondaryBtn, "py-2")} disabled={busy} onClick={() => void logout()}><LogOut className="h-4 w-4" />Sign out {adminName}</button>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-soft)]">Upload up to 10 source files, inspect the detected questions, then import the reviewed set.</p>
        <label
          className={clsx("mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center transition-colors", busy ? "cursor-wait opacity-60" : "cursor-pointer")}
          style={{ borderColor: "var(--accent)", background: dragging ? "var(--accent-soft)" : "var(--surface-2)" }}
          onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy) void uploadFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <FileUp className="h-8 w-8" style={{ color: "var(--accent)" }} />
          <span className="mt-2 font-semibold text-[var(--text)]">Choose PDF or CSV files</span>
          <span className="mt-1 text-xs text-[var(--text-soft)]">Drag and drop or click to browse · maximum 10 files</span>
          <input
            className="sr-only"
            disabled={busy}
            type="file"
            multiple
            accept=".pdf,.csv,text/csv,application/pdf"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void uploadFiles(files);
            }}
          />
        </label>
        <p aria-live="polite" className="mt-3 text-sm text-[var(--text-soft)]">{status}</p>
      </div>
      {preview.length > 0 && (
        <div className={clsx(platformCard, "mt-6 overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-[var(--text-soft)]">
                <tr><th className="p-3 font-bold">File</th><th className="p-3 font-bold">Topic</th><th className="p-3 font-bold">Question</th><th className="p-3 font-bold">Options</th><th className="p-3 font-bold">Answer</th></tr>
              </thead>
              <tbody>
                {preview.map((question, index) => (
                  <tr key={`${question.question}-${index}`} className="border-t border-[var(--border)]">
                    <td className="p-3 align-top text-[var(--text-soft)]">{question.fileName}</td>
                    <td className="p-3 align-top">{question.topic}</td>
                    <td className="p-3 align-top">{question.question}</td>
                    <td className="p-3 align-top">{question.options.length}</td>
                    <td className="p-3 align-top">{question.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t border-[var(--border)] p-4">
            <button className={platformPrimaryBtn} disabled={busy} onClick={() => void commitImport()}>{busy ? "Importing..." : `Import ${preview.length} reviewed questions from ${batches.length} file${batches.length === 1 ? "" : "s"}`}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function QuestionPanel({ question, selected, reveal, onSelect, eyebrow }: { question: ExamQuestion; selected: string[]; reveal: boolean; onSelect: (optionId: string) => void; eyebrow: string }) {
  return (
    <article className={clsx(platformCard, "p-6")}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{eyebrow}</p>
      <h3 className="mt-3 text-xl font-semibold leading-8">{question.text}</h3>
      <div className="mt-5 grid gap-3">
        {question.options.map((option) => {
          const selectedIncorrect = reveal && selected.includes(option.id) && !option.isCorrect;
          return (
            <button
            key={option.id}
            className="rounded-xl border bg-[var(--surface)] p-4 text-left transition-all disabled:cursor-default"
            disabled={reveal}
            aria-pressed={selected.includes(option.id)}
            style={{
              borderColor: reveal && option.isCorrect ? "var(--success-border)" : selectedIncorrect ? "var(--danger-border)" : selected.includes(option.id) ? "var(--accent)" : "var(--border)",
              background: reveal && option.isCorrect ? "var(--success-soft)" : selectedIncorrect ? "var(--danger-soft)" : "var(--surface)",
              boxShadow: !reveal && selected.includes(option.id) ? "0 0 0 3px var(--accent-soft)" : "none",
            }}
            onClick={() => onSelect(option.id)}
          >
            <span className="mr-2 font-bold text-[var(--text-soft)]">{option.label}.</span>{option.text}
          </button>
          );
        })}
      </div>
    </article>
  );
}

function Feedback({ question, selected, correct }: { question: ExamQuestion; selected: string[]; correct: boolean }) {
  const correctOptions = question.options.filter((option) => option.isCorrect);
  return (
    <div className={clsx(platformCard, "mt-5 p-5")}>
      <div className="flex items-center gap-2 font-bold" style={{ color: correct ? "var(--success)" : "var(--danger)" }}>
        {correct ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
        {correct ? "Correct" : "Incorrect"}
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]">Why your answer is {correct ? "right" : "wrong"}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text)]">{describeAnswerResult(question, selected)}</p>
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]">Correct answer</p>
      <div className="mt-2 grid gap-2">
        {correctOptions.map((option) => (
          <div key={option.id} className="rounded-lg border border-[var(--success-border)] bg-[var(--success-soft)] p-3 text-sm">
            <strong>{option.label}.</strong> {option.text}
            {option.rationale?.trim() && <p className="mt-1 text-[var(--text-soft)]">{option.rationale}</p>}
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-soft)]">Why the correct answer is correct</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--text-soft)]">{explainCorrectAnswer(question)}</p>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <input className={platformInput} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex items-center gap-2 text-[var(--accent)] [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function createSessionSeed() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readLastQuestion(key: string) {
  return typeof window === "undefined" ? null : window.localStorage.getItem(key);
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function avoidPreviousFirst<T extends { id: string }>(items: T[], previousId: string | null) {
  if (items.length > 1 && items[0].id === previousId) {
    [items[0], items[1]] = [items[1], items[0]];
  }
  return items;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-soft)]">{label}</p>
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm font-medium"><span>{label}</span><span className="text-[var(--text-soft)]">{value}%</span></div>
      <div className="h-2 rounded-full bg-[var(--border)]"><div className="h-2 rounded-full transition-[width] duration-500" style={{ width: `${value}%`, backgroundImage: "var(--gradient-primary)" }} /></div>
    </div>
  );
}

function Nav({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors [&_svg]:h-4 [&_svg]:w-4"
      style={active ? { borderColor: "var(--nav-active-border)", background: "var(--nav-active-bg)", color: "var(--nav-active-text)" } : { borderColor: "transparent", color: "var(--text-soft)" }}
      onClick={onClick}
    >
      {icon}{children}
    </button>
  );
}

function toggleSelection(current: string[], optionId: string) {
  return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
}

function addQuestionTime(answers: AttemptAnswer[], questionId: string, elapsed: number, markedForReview: boolean) {
  const existing = answers.find((answer) => answer.questionId === questionId);
  return [
    ...answers.filter((answer) => answer.questionId !== questionId),
    {
      questionId,
      selectedOptionIds: existing?.selectedOptionIds ?? [],
      timeSpentSeconds: (existing?.timeSpentSeconds ?? 0) + elapsed,
      markedForReview,
    },
  ];
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
