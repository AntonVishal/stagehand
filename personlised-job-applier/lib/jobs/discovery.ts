import { z } from "zod";

import {
  JOB_SITES,
  type DiscoverInput,
  type JobApplication,
} from "@/lib/jobs/types";
import { appendJobLog, readJobsState, writeJobsState } from "@/lib/jobs/store";

const DiscoverInputSchema = z.object({
  roleQuery: z.string().trim().min(1).optional(),
  sites: z
    .array(
      z.enum([
        "ashby",
        "greenhouse",
        "lever",
        "workable",
        "wellfound",
        "company",
      ]),
    )
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function sourceQueries(
  roleQuery: string,
  selectedSources = JOB_SITES.map((site) => site.source),
) {
  return JOB_SITES.filter((source) =>
    selectedSources.includes(source.source),
  ).map((source) => {
    const query = `site:${source.site} ${roleQuery}`;
    return {
      ...source,
      query,
      searchUrl: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    };
  });
}

export async function discoverJobs(input: DiscoverInput = {}) {
  const parsed = DiscoverInputSchema.parse(input);
  const roleQuery =
    parsed.roleQuery ?? process.env.DEFAULT_ROLE_QUERY ?? "Product Engineer";
  const selectedSites = parsed.sites?.length
    ? parsed.sites
    : JOB_SITES.map((site) => site.source);
  const limit = parsed.limit ?? 25;
  const now = new Date().toISOString();
  const queryResults = await Promise.all(
    sourceQueries(roleQuery, selectedSites).map((query) =>
      searchJobs(query, roleQuery, now),
    ),
  );
  const jobs = dedupe(queryResults.flat()).slice(0, limit);

  const previous = await readJobsState();
  const state = await writeJobsState({
    ...previous,
    defaultRoleQuery: roleQuery,
    jobs,
  });
  const log = await appendJobLog({
    level: "info",
    message: `Search complete: found ${jobs.length} URL${jobs.length === 1 ? "" : "s"} for "${roleQuery}" across ${selectedSites.length} site${selectedSites.length === 1 ? "" : "s"}.`,
  });
  return { ...state, logs: [log, ...(state.logs ?? [])] };
}

async function searchJobs(
  query: ReturnType<typeof sourceQueries>[number],
  roleQuery: string,
  now: string,
): Promise<JobApplication[]> {
  try {
    const pages = await Promise.all([
      fetchSearchPage(query.searchUrl),
      fetchSearchPage(jinaReaderUrl(query.searchUrl)),
    ]);
    return Array.from(
      new Set(pages.flatMap((html) => extractSearchUrls(html, query.site))),
    )
      .slice(0, 20)
      .map((url, index) =>
        makeJobFromUrl({ url, query, roleQuery, now, index }),
      );
  } catch {
    return [];
  }
}

async function fetchSearchPage(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
    cache: "no-store",
  });
  if (!res.ok) return "";
  return res.text();
}

function jinaReaderUrl(url: string) {
  return `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
}

function extractSearchUrls(html: string, expectedHost: string) {
  const urls = new Set<string>();
  const hrefPattern = /href="([^"]+)"/g;
  const bareUrlPattern = /https?:\/\/[^\s)"'<]+/g;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html))) {
    addUrl(match[1]);
  }

  while ((match = bareUrlPattern.exec(html))) {
    addUrl(match[0]);
  }

  return Array.from(urls);

  function addUrl(raw: string) {
    const decoded = decodeHtml(raw);
    const url = unwrapDuckDuckGoUrl(decoded);
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!hostMatches(parsed.hostname, expectedHost)) return;
      parsed.hash = "";
      urls.add(parsed.toString());
    } catch {
      // Ignore non-URL hrefs.
    }
  }
}

function unwrapDuckDuckGoUrl(href: string) {
  if (
    href.startsWith("//duckduckgo.com/l/") ||
    href.startsWith("http://duckduckgo.com/l/") ||
    href.startsWith("https://duckduckgo.com/l/")
  ) {
    const parsed = new URL(href.startsWith("//") ? `https:${href}` : href);
    return parsed.searchParams.get("uddg");
  }
  if (href.startsWith("/l/?")) {
    const parsed = new URL(href, "https://duckduckgo.com");
    return parsed.searchParams.get("uddg");
  }
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return null;
}

function hostMatches(hostname: string, expectedHost: string) {
  if (expectedHost.endsWith("/jobs"))
    return hostname === expectedHost.replace("/jobs", "");
  return hostname === expectedHost || hostname.endsWith(`.${expectedHost}`);
}

function makeJobFromUrl({
  url,
  query,
  roleQuery,
  now,
  index,
}: {
  url: string;
  query: ReturnType<typeof sourceQueries>[number];
  roleQuery: string;
  now: string;
  index: number;
}): JobApplication {
  const parsed = new URL(url);
  const title = titleFromUrl(parsed, roleQuery);
  const company = companyFromUrl(parsed, query.label);
  const id =
    `${query.source}-${slug(parsed.hostname)}-${slug(parsed.pathname)}-${index}`.slice(
      0,
      140,
    );

  return {
    id,
    company,
    role: title,
    source: query.source,
    sourceLabel: query.label,
    url,
    status: "discovered",
    matchScore: 0,
    location: "Extract during run",
    remote: false,
    description: `Found from search query: ${query.query}`,
    rationale:
      "No scoring is applied. URLs are queued in search-result order and can be applied one by one.",
    lastAction: `Found via ${query.query}`,
    questions: [],
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };
}

function companyFromUrl(url: URL, fallback: string) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname.includes("ashbyhq.com"))
    return readable(parts[0] ?? fallback);
  if (url.hostname.includes("lever.co")) return readable(parts[0] ?? fallback);
  if (url.hostname.includes("greenhouse.io"))
    return readable(parts[0] ?? fallback);
  if (url.hostname.includes("workable.com"))
    return readable(parts[0] ?? fallback);
  return readable(url.hostname.replace(/^www\./, "").split(".")[0] ?? fallback);
}

function titleFromUrl(url: URL, fallback: string) {
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts.at(-1);
  return readable(last && !/^\d+$/.test(last) ? last : fallback);
}

function readable(value: string) {
  return decodeURIComponent(value)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function dedupe(jobs: JobApplication[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = job.url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
