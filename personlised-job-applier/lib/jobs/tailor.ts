import { generateText, Output } from "ai";
import { z } from "zod";

import type {
  JobApplication,
  JobQuestion,
  TailoredResume,
} from "@/lib/jobs/types";
import { appendJobLog } from "@/lib/jobs/store";

const TailoredResumeSchema = z.object({
  selectedFit: z.array(z.string()).min(3).max(4),
  experienceBullets: z.array(z.string()).min(4).max(6),
  projectBullets: z.array(z.string()).min(2).max(4),
  skillsLine: z.string(),
});

const TailoredAnswersSchema = z.object({
  summary: z.string(),
  additionalInstructions: z.string(),
  tailoredResume: TailoredResumeSchema,
  questions: z.array(
    z.object({
      prompt: z.string(),
      answer: z.string(),
    }),
  ),
});

export async function tailorForJob(job: JobApplication): Promise<{
  summary: string;
  additionalInstructions: string;
  tailoredResume: TailoredResume;
  questions: JobQuestion[];
}> {
  if (!process.env.AI_GATEWAY_API_KEY) return fallbackTailoring(job);

  try {
    const result = await generateText({
      model: "google/gemini-3.1-flash-lite-preview",
      output: Output.object({ schema: TailoredAnswersSchema }),
      system: `You create honest, targeted application materials for Vishal Anton.

Person profile:
- Vishal is a Product Engineer with a strong browser automation and developer experience angle.
- He works with Stagehand and Browserbase to build reliable browser-agent workflows.
- Strongest evidence: Stagehand file uploads where act() resolves local files and setInputFiles() uploads into Browserbase-hosted sessions.
- He has built a personalised job applier that discovers job URLs, extracts JDs/questions, generates LaTeX/PDF materials, fills forms, uploads resumes, records replayable sessions, and stops before final submit for human review.
- He is strongest in TypeScript, Node.js, React, Playwright-style browser automation, Stagehand, Browserbase, AI SDK, Zod, LaTeX/PDF generation, and technical writing.
- He is credible for product engineering roles that value high agency, shipping quality, developer tooling, agent reliability, workflow automation, and crisp product judgment.

Return an additionalInstructions field that tells the resume renderer how to restructure the base resume for the JD. Make it concrete: which sections should move up, which bullets should be emphasized or softened, what keywords from the JD should appear, and what proof points from the person profile should be foregrounded. Do not add fictional employment history, metrics, credentials, or employer-specific facts.`,
      prompt: `Create concise, honest application material for this job URL. Keep the angle Product Engineer, Stagehand, Browserbase, browser automation, and reliable file upload. Do not invent employer-specific facts that are not in the URL metadata.

Also create tailoredResume content that will be printed directly in the resume. It must differ by JD: use the company's role language, reorder emphasis, and pick different bullets when the JD is different. Keep every bullet truthful to the person profile.\n\n${JSON.stringify(
        {
          company: job.company,
          role: job.role,
          source: job.sourceLabel,
          url: job.url,
          description: job.description,
        },
      )}`,
    });
    return result.output ?? fallbackTailoring(job);
  } catch (error) {
    await appendJobLog({
      jobId: job.id,
      level: "error",
      message: `AI Gateway tailoring failed; using fallback answers. ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    return fallbackTailoring(job);
  }
}

function fallbackTailoring(job: JobApplication): {
  summary: string;
  additionalInstructions: string;
  tailoredResume: TailoredResume;
  questions: JobQuestion[];
} {
  return {
    summary: `${job.role} application package for ${job.company}, generated from the discovered URL and focused on Product Engineer work around browser agents, reliable form automation, and Stagehand file uploads.`,
    additionalInstructions: `Restructure the resume for ${job.role} at ${job.company}: keep the Product Engineer summary first, move Stagehand + Browserbase browser-agent work to the top of Relevant Work, emphasize reliable file uploads, deterministic form filling, JD/question extraction, replayable sessions, TypeScript/React/Node implementation, and human-in-the-loop review. Keep claims grounded in the base profile.`,
    tailoredResume: {
      selectedFit: [
        `Product engineer profile tailored to ${job.role} at ${job.company}, with browser automation and developer-facing product work first.`,
        "Strongest proof points: Stagehand file uploads, Browserbase-hosted sessions, deterministic form filling, JD/question extraction, replayable sessions, and human-in-the-loop review.",
        "Practical builder across TypeScript, Node.js, React, Playwright-style automation, AI SDK integrations, Zod schemas, and LaTeX/PDF artifact generation.",
      ],
      experienceBullets: [
        "Built a Stagehand file-upload path where act() resolves local files and setInputFiles() uploads into Browserbase-hosted browser sessions.",
        "Designed browser-agent workflows with discovery, AI-assisted extraction, deterministic form filling, and a human approval gate before final submit.",
        "Improved action reliability for multi-step application flows with observe/act decomposition, clearer failure logs, replayable sessions, and safer retry boundaries.",
        "Turned low-level platform work into demos, documentation, examples, and developer-facing narratives for technical audiences.",
      ],
      projectBullets: [
        "Personalised Job Applier -- Stagehand + Browserbase demo that discovers job URLs, extracts JDs, generates tailored materials, uploads a resume PDF, and stops at human review.",
        "Agent form automation -- Reliable fill + upload loops across Ashby/Greenhouse-style application pages with replayable Browserbase sessions.",
        "Resume tailoring pipeline -- AI-assisted material generation that keeps claims honest, restructures emphasis from the JD, compiles LaTeX to PDF, and preserves review before submission.",
      ],
      skillsLine:
        "TypeScript -- Node.js -- React -- Playwright / browser automation -- Stagehand -- Browserbase -- Zod -- AI SDK -- LaTeX -- DX / technical writing",
    },
    questions: [
      {
        prompt: "Why are you interested in this role?",
        answer:
          "I am interested in product engineering work where developer experience, automation reliability, and clear technical storytelling all matter.",
      },
      {
        prompt: "Relevant project",
        answer:
          "I worked on a Stagehand file-upload flow where act() resolves local files and uses setInputFiles() for Browserbase-hosted browser sessions, which is directly relevant to robust browser-agent workflows.",
      },
    ],
  };
}
