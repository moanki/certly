"use client";

import type React from "react";
import { BarChart3, BookOpenCheck, CheckCircle2, Clock3, FileUp, Flag, LayoutDashboard, ListChecks, LockKeyhole, LogOut, RotateCcw, ShieldCheck, Trophy, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { getCorrectOptionIds, hcipHuaweiPreset, isAnswerCorrect, normalizeQuestionCount, scoreAttempt, shuffleWithSeed } from "@/lib/exam-engine";
import { certifications, sampleQuestions, topics } from "@/lib/questions";
import type { AttemptAnswer, Candidate, ExamQuestion, ImportPreviewQuestion } from "@/types/exam";
import { AdminLogin } from "@/components/admin-login";

export type View = "dashboard" | "practice" | "exam-setup" | "exam" | "results" | "admin";

const storageKey = "certly-active-attempt";

type AttemptHistoryItem = {
  id: string;
  submittedAt: string;
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  durationSeconds: number;
};

export function CertlyApp({ initialView = "dashboard" }: { initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [candidate, setCandidate] = useState<Candidate>({ name: "", email: "" });
  const [selectedTopic, setSelectedTopic] = useState("Mixed Mock");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceSelected, setPracticeSelected] = useState<string[]>([]);
  const [practiceRevealed, setPracticeRevealed] = useState(false);
  const [answers, setAnswers] = useState<AttemptAnswer[]>([]);
  const [timed, setTimed] = useState(true);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [remainingSeconds, setRemainingSeconds] = useState(hcipHuaweiPreset.durationMinutes * 60);
  const [saveStatus, setSaveStatus] = useState("");
  const [questionBank, setQuestionBank] = useState(sampleQuestions);
  const [attemptHistory, setAttemptHistory] = useState<AttemptHistoryItem[]>([]);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const questionOpenedAt = useRef(0);

  const examQuestions = useMemo(() => {
    const count = normalizeQuestionCount(questionBank.length, hcipHuaweiPreset.questionCount);
    return shuffleWithSeed(questionBank, `${candidate.email || "guest"}-mock`)
      .slice(0, count)
      .map((question) => ({
        ...question,
        options: shuffleWithSeed(question.options, `${candidate.email || "guest"}-${question.id}`).map((option, index) => ({
          ...option,
          label: String.fromCharCode(65 + index),
        })),
      }));
  }, [candidate.email, questionBank]);
  const practiceQuestions = useMemo(() => selectedTopic === "Mixed Mock" ? questionBank : questionBank.filter((question) => question.topic === selectedTopic), [questionBank, selectedTopic]);
  const summary = useMemo(() => scoreAttempt(examQuestions, answers), [answers, examQuestions]);
  const activeQuestion = examQuestions[questionIndex];
  const practiceQuestion = practiceQuestions[practiceIndex] ?? questionBank[0];

  useEffect(() => {
    void fetch("/api/questions")
      .then((response) => response.json())
      .then((data: { questions?: ExamQuestion[] }) => {
        if (data.questions?.length) setQuestionBank(data.questions);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!candidate.email.trim()) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void fetch(`/api/attempts?email=${encodeURIComponent(candidate.email.trim())}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data: { attempts?: AttemptHistoryItem[] }) => setAttemptHistory(data.attempts ?? []))
        .catch(() => undefined);
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [candidate.email]);

  useEffect(() => {
    if (!startedAt) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ candidate, answers, startedAt, marked: [...marked] }));
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
    setAnswers([]);
    setMarked(new Set());
    setQuestionIndex(0);
    setStartedAt(new Date().toISOString());
    setRemainingSeconds(hcipHuaweiPreset.durationMinutes * 60);
    setSaveStatus("");
    questionOpenedAt.current = Date.now();
    setView("exam");
  }

  function resetAttempt() {
    window.localStorage.removeItem(storageKey);
    setAnswers([]);
    setMarked(new Set());
    setStartedAt(null);
    setQuestionIndex(0);
    setView("exam-setup");
  }

  const finishExam = useCallback(async () => {
    if (!startedAt || !activeQuestion) return;
    const elapsed = Math.max(1, Math.round((Date.now() - questionOpenedAt.current) / 1000));
    const finalAnswers = addQuestionTime(answers, activeQuestion.id, elapsed, marked.has(activeQuestion.id));
    const result = scoreAttempt(examQuestions, finalAnswers);
    const submittedAt = new Date().toISOString();

    setAnswers(finalAnswers);
    setStartedAt(null);
    window.localStorage.removeItem(storageKey);
    setView("results");
    setSaveStatus("Saving attempt...");

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
          score: result.score,
          passed: result.passed,
          correct: result.correct,
          incorrect: result.incorrect,
          unanswered: result.unanswered,
          total: result.total,
          durationSeconds: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)),
          answers: result.results.map((item) => ({
            questionId: item.question.id,
            selectedOptionIds: item.selectedOptionIds,
            timeSpentSeconds: item.timeSpentSeconds,
            markedForReview: marked.has(item.question.id),
            isCorrect: item.isCorrect,
          })),
        }),
      });
      setSaveStatus(response.ok ? "Attempt saved." : "Result shown, but attempt history could not be saved.");
    } catch {
      setSaveStatus("Result shown, but attempt history could not be saved.");
    }
  }, [activeQuestion, answers, candidate, examQuestions, marked, startedAt, timed]);

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

  return (
    <main className="min-h-screen bg-[#f3f5f6] text-[#161616]">
      {(view !== "admin" || adminAuthenticated) && <header className="border-b border-[#d7dde1] bg-[#ffffff]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b14f2a]">Huawei certification simulator</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Certly</h1>
          </div>
          {view !== "exam" && <nav className="flex flex-wrap gap-2">
            <Nav active={view === "dashboard"} icon={<LayoutDashboard />} onClick={() => setView("dashboard")}>Dashboard</Nav>
            <Nav active={view === "practice"} icon={<BookOpenCheck />} onClick={() => setView("practice")}>Practice</Nav>
            <Nav active={view === "exam-setup"} icon={<ShieldCheck />} onClick={() => setView("exam-setup")}>Exam Mode</Nav>
            <Nav active={view === "admin"} icon={<LockKeyhole />} onClick={() => setView("admin")}>Admin</Nav>
          </nav>}
        </div>
      </header>}

      {view === "dashboard" && <Dashboard candidate={candidate} setCandidate={setCandidate} summary={summary} attemptHistory={attemptHistory} questionBank={questionBank} goExam={() => setView("exam-setup")} goPractice={() => setView("practice")} />}
      {view === "practice" && (
        <PracticeMode
          topic={selectedTopic}
          setTopic={(topic) => { setSelectedTopic(topic); setPracticeIndex(0); setPracticeSelected([]); setPracticeRevealed(false); }}
          question={practiceQuestion}
          index={practiceIndex}
          total={practiceQuestions.length}
          selected={practiceSelected}
          setSelected={setPracticeSelected}
          revealed={practiceRevealed}
          setRevealed={setPracticeRevealed}
          next={() => { setPracticeIndex((current) => (current + 1) % practiceQuestions.length); setPracticeSelected([]); setPracticeRevealed(false); }}
        />
      )}
      {view === "exam-setup" && <ExamSetup candidate={candidate} setCandidate={setCandidate} timed={timed} setTimed={setTimed} onStart={startExam} hasDraft={Boolean(startedAt)} onReset={resetAttempt} />}
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
          onToggleMark={(questionId) => setMarked((current) => { const next = new Set(current); if (next.has(questionId)) next.delete(questionId); else next.add(questionId); return next; })}
        />
      )}
      {view === "results" && <Results summary={summary} questions={examQuestions} answers={answers} saveStatus={saveStatus} onRetake={resetAttempt} />}
      {view === "admin" && <AdminImport onAuthChange={setAdminAuthenticated} />}
    </main>
  );
}

function Dashboard({ candidate, setCandidate, summary, attemptHistory, questionBank, goExam, goPractice }: { candidate: Candidate; setCandidate: (candidate: Candidate) => void; summary: ReturnType<typeof scoreAttempt>; attemptHistory: AttemptHistoryItem[]; questionBank: ExamQuestion[]; goExam: () => void; goPractice: () => void }) {
  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-lg border border-[#d7dde1] bg-[#ffffff] p-6 shadow-sm">
        <p className="text-sm font-semibold text-[#b14f2a]">{certifications[0].name}</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight">Practice like a learner. Sit the mock like it is Pearson VUE day.</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#59636e]">Certly starts with the HCIP-Datacenter Facility Deployment preset: 60 questions, 90 minutes, all-or-nothing multiple-answer scoring, immediate results, and full review.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <TextInput label="Candidate name" value={candidate.name} onChange={(name) => setCandidate({ ...candidate, name })} placeholder="Your name" />
          <TextInput label="Email" value={candidate.email} onChange={(email) => setCandidate({ ...candidate, email })} placeholder="you@example.com" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="rounded-md bg-[#1d6f75] px-4 py-2 font-semibold text-white" onClick={goExam}>Start exam setup</button>
          <button className="rounded-md border border-[#1d6f75] px-4 py-2 font-semibold text-[#1d6f75]" onClick={goPractice}>Open practice mode</button>
        </div>
        {attemptHistory.length > 0 && <div className="mt-8 border-t border-[#d7dde1] pt-5"><h3 className="font-semibold">Attempt history</h3><div className="mt-3 grid gap-2">{attemptHistory.slice(0, 5).map((attempt) => <div key={attempt.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-[#d7dde1] bg-white p-3 text-sm"><span>{new Date(attempt.submittedAt).toLocaleDateString()}</span><span>{attempt.correct}/{attempt.total} correct</span><strong className={attempt.passed ? "text-[#1d6f75]" : "text-[#b14f2a]"}>{attempt.score}/1000</strong></div>)}</div></div>}
      </div>
      <aside className="grid gap-4">
        <Metric icon={<Trophy />} label="Huawei-style score" value={`${summary.score}/1000`} />
        <Metric icon={<CheckCircle2 />} label="Pass threshold" value="600" />
        <Metric icon={<Clock3 />} label="Full mock duration" value="90 min" />
        <div className="rounded-lg border border-[#d7dde1] bg-[#ffffff] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#59636e]"><BarChart3 className="h-4 w-4" /> Current question bank</div>
          <div className="mt-4 space-y-2">{topics.slice(0, 5).map((topic) => <div key={topic} className="flex justify-between border-b border-[#d7dde1] py-2 text-sm"><span>{topic}</span><span>{questionBank.filter((question) => question.topic === topic).length} questions</span></div>)}</div>
        </div>
      </aside>
    </section>
  );
}

function PracticeMode(props: { topic: string; setTopic: (topic: string) => void; question: ExamQuestion; index: number; total: number; selected: string[]; setSelected: (selected: string[]) => void; revealed: boolean; setRevealed: (revealed: boolean) => void; next: () => void }) {
  const correct = props.revealed && isAnswerCorrect(props.question, props.selected);
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-[#b14f2a]">Practice mode</p><h2 className="text-2xl font-semibold">Immediate feedback and explanations</h2></div>
        <label className="grid gap-2 text-sm font-medium">Topic<select className="rounded-md border border-[#c4cdd3] bg-white px-3 py-2" value={props.topic} onChange={(event) => props.setTopic(event.target.value)}><option>Mixed Mock</option>{topics.map((topic) => <option key={topic}>{topic}</option>)}</select></label>
      </div>
      <QuestionPanel question={props.question} selected={props.selected} reveal={props.revealed} onSelect={(optionId) => props.setSelected(props.question.type === "multiple" ? toggleSelection(props.selected, optionId) : [optionId])} eyebrow={`Question ${props.index + 1} of ${props.total}`} />
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="rounded-md bg-[#1d6f75] px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={props.selected.length === 0} onClick={() => props.setRevealed(true)}>Check answer</button>
        <button className="rounded-md border border-[#c4cdd3] px-4 py-2 font-semibold" onClick={props.next}>Next question</button>
      </div>
      {props.revealed && <Feedback question={props.question} correct={correct} />}
    </section>
  );
}

function ExamSetup({ candidate, setCandidate, timed, setTimed, onStart, hasDraft, onReset }: { candidate: Candidate; setCandidate: (candidate: Candidate) => void; timed: boolean; setTimed: (timed: boolean) => void; onStart: () => void; hasDraft: boolean; onReset: () => void }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="rounded-lg border border-[#d7dde1] bg-[#ffffff] p-6">
        <p className="text-sm font-semibold text-[#b14f2a]">Exam mode</p><h2 className="mt-2 text-3xl font-semibold">Huawei-style mock exam setup</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-4"><Metric icon={<ListChecks />} label="Questions" value="60 preset" /><Metric icon={<Clock3 />} label="Timer" value={timed ? "90 min" : "Untimed"} /><Metric icon={<Trophy />} label="Score scale" value="1000" /><Metric icon={<ShieldCheck />} label="Pass mark" value="600" /></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><TextInput label="Candidate name" value={candidate.name} onChange={(name) => setCandidate({ ...candidate, name })} placeholder="Your name" /><TextInput label="Email" value={candidate.email} onChange={(email) => setCandidate({ ...candidate, email })} placeholder="you@example.com" /></div>
        <label className="mt-5 flex max-w-sm items-center justify-between rounded-md border border-[#c4cdd3] bg-white p-3 text-sm font-medium">Timed exam<input type="checkbox" checked={timed} onChange={(event) => setTimed(event.target.checked)} /></label>
        <div className="mt-6 flex flex-wrap gap-3"><button className="rounded-md bg-[#1d6f75] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!candidate.name.trim()} onClick={onStart}>Start mock exam</button>{hasDraft && <button className="rounded-md border border-[#b14f2a] px-4 py-2 font-semibold text-[#b14f2a]" onClick={onReset}><RotateCcw className="mr-2 inline h-4 w-4" />Start again</button>}</div>
        {!candidate.name.trim() && <p className="mt-3 text-sm text-[#59636e]">Enter the candidate name to start.</p>}
      </div>
    </section>
  );
}

function ExamMode(props: { question: ExamQuestion; questions: ExamQuestion[]; index: number; total: number; answers: AttemptAnswer[]; marked: Set<string>; timed: boolean; remainingSeconds: number; onSelect: (question: ExamQuestion, optionId: string) => void; onPrevious: () => void; onNext: () => void; onJump: (index: number) => void; onFinish: () => void; onToggleMark: (questionId: string) => void }) {
  const selected = props.answers.find((item) => item.questionId === props.question.id)?.selectedOptionIds ?? [];
  return (
    <section className="grid min-h-[calc(100vh-91px)] lg:grid-cols-[1fr_320px]">
      <div className="px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d7dde1] bg-[#ffffff] p-4"><div><p className="text-sm font-semibold text-[#b14f2a]">Exam in progress</p><h2 className="text-xl font-semibold">Question {props.index + 1} of {props.total}</h2></div><div className="flex items-center gap-3"><div aria-live="polite" className="rounded-md border border-[#c4cdd3] bg-white px-3 py-2 text-sm font-semibold">{props.timed ? formatTime(props.remainingSeconds) : "Untimed"}</div><button className="rounded-md border border-[#c4cdd3] px-3 py-2 text-sm font-semibold" onClick={() => props.onToggleMark(props.question.id)}><Flag className="mr-2 inline h-4 w-4" />{props.marked.has(props.question.id) ? "Marked" : "Mark"}</button></div></div>
        <QuestionPanel question={props.question} selected={selected} reveal={false} onSelect={(optionId) => props.onSelect(props.question, optionId)} eyebrow={props.question.type === "multiple" ? "Select all correct answers" : "Select one answer"} />
        <div className="mt-5 flex justify-between gap-3"><button className="rounded-md border border-[#c4cdd3] px-4 py-2 font-semibold" onClick={props.onPrevious}>Previous</button>{props.index === props.total - 1 ? <button className="rounded-md bg-[#b14f2a] px-4 py-2 font-semibold text-white" onClick={props.onFinish}>Submit exam</button> : <button className="rounded-md bg-[#1d6f75] px-4 py-2 font-semibold text-white" onClick={props.onNext}>Next</button>}</div>
      </div>
      <aside className="border-t border-[#d7dde1] bg-[#ffffff] p-5 lg:border-l lg:border-t-0"><h3 className="font-semibold">Question navigator</h3><div className="mt-4 grid grid-cols-6 gap-2">{props.questions.map((question, index) => { const answered = props.answers.some((item) => item.questionId === question.id && item.selectedOptionIds.length > 0); const isMarked = props.marked.has(question.id); return <button key={question.id} className={clsx("h-10 rounded-md border text-sm font-semibold", index === props.index && "border-[#1d6f75] bg-[#dbeeee]", answered && "bg-[#e7f2eb]", isMarked && "border-[#b14f2a]")} onClick={() => props.onJump(index)}>{index + 1}</button>; })}</div></aside>
    </section>
  );
}

function Results({ summary, questions, answers, saveStatus, onRetake }: { summary: ReturnType<typeof scoreAttempt>; questions: ExamQuestion[]; answers: AttemptAnswer[]; saveStatus: string; onRetake: () => void }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-[#d7dde1] bg-[#ffffff] p-6"><p className="text-sm font-semibold text-[#b14f2a]">Immediate result</p><h2 className="mt-2 text-4xl font-semibold">{summary.score}/1000</h2><p className="mt-2 text-lg font-semibold">{summary.passed ? "Pass" : "Fail"}</p><div className="mt-5 grid grid-cols-3 gap-3 text-center"><MiniStat label="Correct" value={summary.correct} /><MiniStat label="Wrong" value={summary.incorrect} /><MiniStat label="Blank" value={summary.unanswered} /></div>{saveStatus && <p className="mt-4 text-sm text-[#59636e]">{saveStatus}</p>}<button className="mt-6 w-full rounded-md bg-[#1d6f75] px-4 py-2 font-semibold text-white" onClick={onRetake}>Retake exam</button></div>
        <div className="rounded-lg border border-[#d7dde1] bg-[#ffffff] p-6"><h3 className="font-semibold">Weak topic analysis</h3><div className="mt-4 space-y-3">{summary.byTopic.map((topic) => <Progress key={topic.topic} label={`${topic.topic} - ${topic.status}`} value={topic.percent} />)}</div></div>
      </div>
      <div className="mt-6 rounded-lg border border-[#d7dde1] bg-[#ffffff] p-6"><h3 className="font-semibold">Full review</h3><div className="mt-4 grid gap-4">{questions.map((question, index) => { const answer = answers.find((item) => item.questionId === question.id); const selected = answer?.selectedOptionIds ?? []; const correct = isAnswerCorrect(question, selected); return <div key={question.id} className="rounded-md border border-[#d7dde1] bg-white p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Question {index + 1}</p><div className="flex items-center gap-2"><span className="text-xs text-[#59636e]">{answer?.timeSpentSeconds ?? 0}s</span><span className={clsx("rounded-full px-3 py-1 text-xs font-semibold", correct ? "bg-[#e7f2eb] text-[#1d6f75]" : "bg-[#f5e5dc] text-[#b14f2a]")}>{correct ? "Correct" : "Review"}</span></div></div><p className="text-sm leading-6">{question.text}</p><p className="mt-3 text-sm text-[#59636e]">Correct answer: {getCorrectOptionIds(question).map((id) => question.options.find((option) => option.id === id)?.label).join(", ")}</p><p className="mt-2 text-sm leading-6 text-[#59636e]">{question.explanation}</p></div>; })}</div></div>
    </section>
  );
}

function AdminImport({ onAuthChange }: { onAuthChange: (authenticated: boolean) => void }) {
  const [preview, setPreview] = useState<ImportPreviewQuestion[]>([]);
  const [status, setStatus] = useState("");
  const [auth, setAuth] = useState<"loading" | "guest" | "admin">("loading");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [importId, setImportId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data: { authenticated: boolean; user?: { name: string } }) => {
        setAuth(data.authenticated ? "admin" : "guest");
        onAuthChange(data.authenticated);
        setAdminName(data.user?.name ?? "");
      })
      .catch(() => {
        setAuth("guest");
        onAuthChange(false);
      });
  }, [onAuthChange]);

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
      onAuthChange(true);
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
    onAuthChange(false);
    setPreview([]);
    setImportId("");
    setStatus("Signed out.");
    setBusy(false);
  }

  async function upload(file: File) {
    const formData = new FormData();
    formData.set("file", file);
    setBusy(true);
    setStatus("Parsing file...");
    try {
      const response = await fetch("/api/import", { method: "POST", body: formData });
      const data = (await response.json()) as { importId?: string; questions?: ImportPreviewQuestion[]; error?: string };
      if (response.status === 401) setAuth("guest");
      setImportId(data.importId ?? "");
      setPreview(data.questions ?? []);
      setStatus(data.error ?? `Detected ${data.questions?.length ?? 0} question blocks. Review before importing.`);
    } catch {
      setStatus("Upload failed. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!importId) return;
    setBusy(true);
    setStatus("Importing reviewed questions...");
    try {
      const response = await fetch(`/api/import/${importId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questions: preview }),
      });
      const data = (await response.json()) as { importedCount?: number; error?: string };
      if (!response.ok) {
        setStatus(data.error ?? "Import failed.");
        return;
      }
      setStatus(`Imported ${data.importedCount ?? 0} questions into Appwrite.`);
      setPreview([]);
      setImportId("");
    } finally {
      setBusy(false);
    }
  }

  if (auth === "loading") {
    return <section className="mx-auto max-w-4xl px-4 py-12 text-sm text-[#59636e] sm:px-6">Checking admin access...</section>;
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
      <div className="rounded-lg border border-[#d7dde1] bg-[#ffffff] p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><FileUp className="h-5 w-5 text-[#b14f2a]" /><div><p className="text-sm font-semibold text-[#b14f2a]">Admin import</p><h2 className="text-2xl font-semibold">PDF and CSV question intake</h2></div></div><button className="flex items-center gap-2 rounded-md border border-[#c4cdd3] px-3 py-2 text-sm font-semibold" disabled={busy} onClick={() => void logout()}><LogOut className="h-4 w-4" />Sign out {adminName}</button></div><p className="mt-3 max-w-3xl text-sm leading-6 text-[#59636e]">Upload a source file, inspect the detected questions, then import the reviewed set.</p><label className={clsx("mt-5 flex flex-col items-center justify-center rounded-lg border border-dashed border-[#b14f2a] bg-white p-8 text-center", busy ? "cursor-wait opacity-60" : "cursor-pointer")}><FileUp className="h-8 w-8 text-[#b14f2a]" /><span className="mt-2 font-semibold">Choose PDF or CSV</span><input className="sr-only" disabled={busy} type="file" accept=".pdf,.csv,text/csv,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label><p aria-live="polite" className="mt-3 text-sm text-[#59636e]">{status}</p></div>
      {preview.length > 0 && <div className="mt-6 overflow-hidden rounded-lg border border-[#d7dde1] bg-[#ffffff]"><div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left text-sm"><thead className="bg-[#e9eef1]"><tr><th className="p-3">Topic</th><th className="p-3">Question</th><th className="p-3">Options</th><th className="p-3">Answer</th></tr></thead><tbody>{preview.map((question, index) => <tr key={`${question.question}-${index}`} className="border-t border-[#d7dde1]"><td className="p-3 align-top">{question.topic}</td><td className="p-3 align-top">{question.question}</td><td className="p-3 align-top">{question.options.length}</td><td className="p-3 align-top">{question.answer}</td></tr>)}</tbody></table></div><div className="flex justify-end border-t border-[#d7dde1] p-4"><button className="rounded-md bg-[#1d6f75] px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void commitImport()}>{busy ? "Importing..." : `Import ${preview.length} reviewed questions`}</button></div></div>}
    </section>
  );
}

function QuestionPanel({ question, selected, reveal, onSelect, eyebrow }: { question: ExamQuestion; selected: string[]; reveal: boolean; onSelect: (optionId: string) => void; eyebrow: string }) {
  return <article className="rounded-lg border border-[#d7dde1] bg-[#ffffff] p-6"><p className="text-sm font-semibold text-[#b14f2a]">{eyebrow}</p><h3 className="mt-3 text-xl font-semibold leading-8">{question.text}</h3><div className="mt-5 grid gap-3">{question.options.map((option) => <button key={option.id} className={clsx("rounded-md border bg-white p-4 text-left transition", selected.includes(option.id) ? "border-[#1d6f75] ring-2 ring-[#1d6f75]/20" : "border-[#d7dde1]", reveal && option.isCorrect && "border-[#1d6f75] bg-[#e7f2eb]")} onClick={() => onSelect(option.id)}><span className="mr-2 font-semibold">{option.label}.</span>{option.text}</button>)}</div></article>;
}

function Feedback({ question, correct }: { question: ExamQuestion; correct: boolean }) {
  return <div className="mt-5 rounded-lg border border-[#d7dde1] bg-[#ffffff] p-5"><div className={clsx("flex items-center gap-2 font-semibold", correct ? "text-[#1d6f75]" : "text-[#b14f2a]")}>{correct ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}{correct ? "Correct" : "Incorrect"}</div><p className="mt-3 text-sm leading-6 text-[#46515b]">{question.explanation}</p><div className="mt-4 grid gap-3">{question.options.map((option) => <div key={option.id} className="rounded-md border border-[#d7dde1] bg-white p-3 text-sm"><strong>{option.label}.</strong> {option.rationale}</div>)}</div></div>;
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<input className="rounded-md border border-[#c4cdd3] bg-white px-3 py-2 outline-none focus:border-[#1d6f75]" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg border border-[#d7dde1] bg-[#ffffff] p-5"><div className="flex items-center gap-2 text-[#b14f2a] [&_svg]:h-4 [&_svg]:w-4">{icon}</div><p className="mt-3 text-sm text-[#59636e]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-[#d7dde1] bg-white p-3"><p className="text-2xl font-semibold">{value}</p><p className="text-xs uppercase tracking-[0.14em] text-[#59636e]">{label}</p></div>;
}

function Progress({ label, value }: { label: string; value: number }) {
  return <div><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{value}%</span></div><div className="h-2 rounded-full bg-[#d7dde1]"><div className="h-2 rounded-full bg-[#1d6f75]" style={{ width: `${value}%` }} /></div></div>;
}

function Nav({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button className={clsx("flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold [&_svg]:h-4 [&_svg]:w-4", active ? "border-[#1d6f75] bg-[#dbeeee] text-[#1d6f75]" : "border-[#d7dde1] bg-white text-[#46515b]")} onClick={onClick}>{icon}{children}</button>;
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
