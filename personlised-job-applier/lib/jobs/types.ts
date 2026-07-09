export const JOB_STATUSES = [
  "discovered",
  "materials_generated",
  "filled",
  "needs_review",
  "submitted",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobSource =
  | "ashby"
  | "greenhouse"
  | "lever"
  | "workable"
  | "wellfound"
  | "company";

export type Artifact = {
  kind: "resume" | "cover_letter" | "answers" | "tex";
  label: string;
  path: string;
  href?: string;
  createdAt: string;
};

export type JobQuestion = {
  prompt: string;
  answer: string;
};

export type TailoredResume = {
  selectedFit: string[];
  experienceBullets: string[];
  projectBullets: string[];
  skillsLine: string;
};

export type JobLog = {
  id: string;
  jobId?: string;
  level: "info" | "success" | "error";
  message: string;
  createdAt: string;
};

export type JobSiteConfig = {
  source: JobSource;
  label: string;
  site: string;
};

export const JOB_SITES: JobSiteConfig[] = [
  { source: "ashby", label: "Ashby", site: "jobs.ashbyhq.com" },
  { source: "greenhouse", label: "Greenhouse", site: "boards.greenhouse.io" },
  { source: "lever", label: "Lever", site: "jobs.lever.co" },
  { source: "workable", label: "Workable", site: "apply.workable.com" },
  { source: "wellfound", label: "Wellfound", site: "wellfound.com/jobs" },
];

export type JobApplication = {
  id: string;
  company: string;
  role: string;
  source: JobSource;
  sourceLabel: string;
  url: string;
  status: JobStatus;
  matchScore: number;
  location: string;
  remote: boolean;
  description: string;
  rationale: string;
  lastAction: string;
  replayUrl?: string;
  sessionId?: string;
  extractedAt?: string;
  submittedAt?: string;
  failureReason?: string;
  questions: JobQuestion[];
  artifacts: Artifact[];
  createdAt: string;
  updatedAt: string;
};

export type JobsState = {
  defaultRoleQuery: string;
  jobs: JobApplication[];
  logs: JobLog[];
  runtime: {
    canRunApplications: boolean;
    missingEnv: string[];
  };
};

export type DiscoverInput = {
  roleQuery?: string;
  sites?: JobSource[];
  limit?: number;
};
