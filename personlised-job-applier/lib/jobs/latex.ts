import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  Artifact,
  JobApplication,
  JobQuestion,
  TailoredResume,
} from "@/lib/jobs/types";

const execFileAsync = promisify(execFile);

const ARTIFACT_ROOT = path.join(process.cwd(), "public", "artifacts");

export async function generateApplicationArtifacts(
  job: JobApplication,
  questions: JobQuestion[],
  summary: string,
  additionalInstructions = "",
  tailoredResume?: TailoredResume,
): Promise<Artifact[]> {
  const now = new Date().toISOString();
  const dirName = `${job.id}-${Date.now()}`;
  const outDir = path.join(ARTIFACT_ROOT, dirName);
  await mkdir(outDir, { recursive: true });

  const resumeTex = renderResume(
    job,
    summary,
    additionalInstructions,
    tailoredResume,
  );
  const coverTex = renderCoverLetter(job, summary, questions);
  const answersJson = JSON.stringify(
    { job: job.id, summary, questions },
    null,
    2,
  );

  const resumeTexPath = path.join(outDir, "resume.tex");
  const coverTexPath = path.join(outDir, "cover-letter.tex");
  const answersPath = path.join(outDir, "answers.json");

  await writeFile(resumeTexPath, resumeTex);
  await writeFile(coverTexPath, coverTex);
  await writeFile(answersPath, `${answersJson}\n`);

  const resumePdf = await compileTex(resumeTexPath, outDir);
  const coverPdf = await compileTex(coverTexPath, outDir);

  const hrefBase = `/artifacts/${dirName}`;
  const artifacts: Artifact[] = [
    {
      kind: "tex",
      label: "Resume LaTeX",
      path: resumeTexPath,
      href: `${hrefBase}/resume.tex`,
      createdAt: now,
    },
    {
      kind: "tex",
      label: "Cover letter LaTeX",
      path: coverTexPath,
      href: `${hrefBase}/cover-letter.tex`,
      createdAt: now,
    },
    {
      kind: "answers",
      label: "Tailored answers",
      path: answersPath,
      href: `${hrefBase}/answers.json`,
      createdAt: now,
    },
  ];

  if (resumePdf) {
    artifacts.unshift({
      kind: "resume",
      label: "Tailored resume PDF",
      path: resumePdf,
      href: `${hrefBase}/resume.pdf`,
      createdAt: now,
    });
  }
  if (coverPdf) {
    artifacts.unshift({
      kind: "cover_letter",
      label: "Cover letter PDF",
      path: coverPdf,
      href: `${hrefBase}/cover-letter.pdf`,
      createdAt: now,
    });
  }

  return artifacts;
}

async function compileTex(
  texPath: string,
  cwd: string,
): Promise<string | null> {
  try {
    // BasicTeX installed via Homebrew provides the pdflatex binary used here.
    await execFileAsync(
      "pdflatex",
      ["-interaction=nonstopmode", "-halt-on-error", path.basename(texPath)],
      {
        cwd,
        timeout: 30_000,
      },
    );
    return texPath.replace(/\.tex$/, ".pdf");
  } catch {
    return null;
  }
}

function renderResume(
  job: JobApplication,
  summary: string,
  additionalInstructions: string,
  tailoredResume?: TailoredResume,
) {
  const resume = tailoredResume ?? fallbackResume(job);

  return String.raw`\documentclass[10pt]{article}
\usepackage[margin=0.7in]{geometry}
\usepackage[hidelinks]{hyperref}
\pagestyle{empty}
\hyphenpenalty=10000
\exhyphenpenalty=10000
\sloppy
\begin{document}

\begin{center}
{\LARGE\textbf{Vishal Anton}}\\[2pt]
Product Engineer -- Browser Automation -- Developer Experience\\[2pt]
\href{mailto:vishalanton@appexert.com}{vishalanton@appexert.com}
\quad -- \quad
\href{https://github.com/browserbase/stagehand}{github.com/browserbase/stagehand}
\end{center}

% Tailoring instructions from the application-materials system prompt: ${texComment(additionalInstructions)}

\section*{Targeted Summary}
${escapeTex(summary)}

\section*{Selected Fit}
\begin{itemize}
${renderItems(resume.selectedFit)}
\end{itemize}

\section*{Experience}

\subsection*{Product Engineer -- Browserbase / Stagehand \hfill 2024 -- Present}
\begin{itemize}
${renderItems(resume.experienceBullets)}
\end{itemize}

\subsection*{Software Engineer -- Developer Tools \hfill 2021 -- 2024}
\begin{itemize}
\item Shipped TypeScript/Node services and React UIs for internal automation and developer productivity tools.
\item Owned form-heavy product surfaces: validation, file inputs, multi-step state, and observability around failure modes.
\item Partnered with design and support to convert recurring support tickets into product fixes and clearer docs.
\item Built pragmatic automation around workflows where accuracy, recoverability, and clean handoffs mattered more than flashy demos.
\end{itemize}

\section*{Projects}
\begin{itemize}
${renderItems(resume.projectBullets)}
\end{itemize}

\section*{Skills}
${escapeTex(resume.skillsLine)}

\section*{Education}
B.S. Computer Science

\end{document}
`;
}

function renderCoverLetter(
  job: JobApplication,
  summary: string,
  questions: JobQuestion[],
) {
  return String.raw`\documentclass[11pt]{letter}
\usepackage[margin=0.9in]{geometry}
\signature{Product Engineer / DevRel Candidate}
\address{Stagehand + Browserbase demo application}
\begin{document}
\begin{letter}{${escapeTex(job.company)} Hiring Team}
\opening{Hi ${escapeTex(job.company)} team,}

${escapeTex(summary)}

What stood out about this role is the chance to make developer-facing product work concrete: ship the primitive, prove it in a real browser, and package the learning so other builders can trust it.

${questions
  .slice(0, 2)
  .map((q) => `\\textbf{${escapeTex(q.prompt)}} ${escapeTex(q.answer)}`)
  .join("\n\n")}

\closing{Best,}
\end{letter}
\end{document}
`;
}

export function preferredResumePath(artifacts: Artifact[]) {
  return artifacts.find((artifact) => artifact.kind === "resume")?.path;
}

function fallbackResume(job: JobApplication): TailoredResume {
  return {
    selectedFit: [
      `Product engineer profile aligned to ${job.role} at ${job.company}, with emphasis on reliable browser automation and developer-facing product work.`,
      "Strongest proof points: Stagehand file uploads, Browserbase-hosted sessions, deterministic form filling, JD/question extraction, replayable sessions, and human-in-the-loop review.",
      "Practical builder across TypeScript, Node.js, React, Playwright-style automation, AI SDK integrations, Zod schemas, and LaTeX/PDF artifact generation.",
    ],
    experienceBullets: [
      "Built a Stagehand file-upload path where act() resolves local files and uses setInputFiles() for Browserbase-hosted browser sessions.",
      "Designed browser-agent workflows with discovery, AI-assisted extraction, deterministic form filling, and a human approval gate before final submit.",
      "Improved action reliability for multi-step application flows with observe/act decomposition, clearer failure logs, replayable sessions, and safer retry boundaries.",
      "Turned low-level platform work into demos, documentation, examples, and developer-facing narratives for technical audiences.",
      "Worked across TypeScript, Node.js, React, Playwright-style browser automation, AI SDK integrations, Zod schemas, and LaTeX/PDF generation.",
    ],
    projectBullets: [
      "Personalised Job Applier -- Stagehand + Browserbase demo that discovers job URLs, extracts JDs, generates tailored materials, uploads a resume PDF, and stops at human review.",
      "Agent form automation -- Reliable fill + upload loops across Ashby/Greenhouse-style application pages with replayable Browserbase sessions.",
      "Resume tailoring pipeline -- AI-assisted material generation that keeps claims honest, restructures emphasis from the JD, compiles LaTeX to PDF, and preserves a review step before submission.",
    ],
    skillsLine:
      "TypeScript -- Node.js -- React -- Playwright / browser automation -- Stagehand -- Browserbase -- Zod -- AI SDK -- LaTeX -- DX / technical writing",
  };
}

function renderItems(items: string[]) {
  return items.map((item) => `\\item ${escapeTex(item)}`).join("\n");
}

function escapeTex(value: string) {
  return value
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function texComment(value: string) {
  return (value || "No extra restructuring instructions were generated.")
    .replace(/\r?\n/g, " ")
    .replace(/%/g, " percent ")
    .trim();
}
