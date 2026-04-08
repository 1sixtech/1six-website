'use client';

import { useState } from 'react';

interface Job {
  title: string;
  location: string;
}

interface JobGroup {
  category: string;
  jobs: Job[];
}

const JOB_GROUPS: JobGroup[] = [
  {
    category: 'engineering',
    jobs: [
      { title: 'core protocol engineer', location: 'Seoul' },
      { title: 'lead engineer', location: 'Remote' },
      { title: 'cryptography research engineer', location: 'Seoul' },
    ],
  },
  {
    category: 'design',
    jobs: [{ title: 'lead designer', location: 'Seoul' }],
  },
  {
    category: 'marketing',
    jobs: [{ title: 'marketing lead', location: 'Seoul' }],
  },
  {
    category: 'research',
    jobs: [{ title: 'researcher', location: 'Cambridge' }],
  },
];

export function CareersSection() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['engineering']));

  const toggle = (category: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <section
      id="careers"
      className="py-24"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="mx-auto max-w-[890px] px-[22px] md:px-6">
        <p className="mb-12 text-center text-[20px] font-normal tracking-[-0.4px] text-[var(--color-sub-text2)]">
          CAREERS
        </p>

        {JOB_GROUPS.map((group) => (
          <div key={group.category} className="mb-6">
            <button
              onClick={() => toggle(group.category)}
              className="mb-2 text-left text-[24px] font-medium tracking-[-0.48px]"
              style={{ color: 'var(--color-text)' }}
            >
              {group.category}
            </button>

            {expanded.has(group.category) && (
              <div className="flex flex-col">
                {group.jobs.map((job) => (
                  <div
                    key={job.title}
                    className="flex items-center justify-between border-t py-3"
                    style={{ borderColor: 'var(--color-sub-text2)', borderTopWidth: '0.5px' }}
                  >
                    <div>
                      <span
                        className="text-[18px] font-normal tracking-[-0.36px]"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {job.title}
                      </span>
                      <span className="ml-2 text-[14px] text-[var(--color-sub-text1)]">
                        {job.location}
                      </span>
                    </div>
                    <a
                      href="#"
                      className="text-[14px] text-[var(--color-sub-text1)] transition-colors hover:text-[var(--color-accent)]"
                    >
                      Apply
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
