"use client";

import { CheckCircle2, Compass, ListOrdered, UserCheck } from "lucide-react";

import { Card } from "@/components/ui/Card";
import type { JobApplication } from "@/lib/jobs/types";

export function JobKpiRow({ jobs }: { jobs: JobApplication[] }) {
  const discovered = jobs.length;
  const queued = jobs.filter((job) => job.status === "discovered").length;
  const review = jobs.filter((job) => job.status === "needs_review").length;
  const submitted = jobs.filter((job) => job.status === "submitted").length;

  const cards = [
    {
      label: "URLs found",
      value: discovered,
      icon: Compass,
      note: "from targeted site-search queries",
    },
    {
      label: "Queued",
      value: queued,
      icon: ListOrdered,
      note: "processed one by one in result order",
    },
    {
      label: "Ready for review",
      value: review,
      icon: UserCheck,
      note: "filled and stopped before submit",
    },
    {
      label: "Submitted",
      value: submitted,
      icon: CheckCircle2,
      note: "only after explicit approval",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="type-caption text-text-tertiary">{card.label}</p>
              <p className="mt-2 text-[30px] font-semibold leading-none tabular-nums text-text-primary">
                {card.value}
              </p>
            </div>
            <span className="rounded-md border border-border-faint bg-bg-subtle p-2 text-primary">
              <card.icon size={17} />
            </span>
          </div>
          <p className="mt-4 type-caption text-text-tertiary">{card.note}</p>
        </Card>
      ))}
    </div>
  );
}
