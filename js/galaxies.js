// Content for the Work universe: two galaxies, each with planets you can
// open. Text comes from the site's existing copy; personal planets are
// placeholders until there's more to say about each.

export const GALAXIES = [
  {
    id: 'professional',
    name: 'Professional',
    blurb: 'Projects, experience and competitions.',
    planets: [
      {
        id: 'projects',
        name: 'Projects',
        kicker: 'Products I build and keep refining',
        type: 'projects',
      },
      {
        id: 'experience',
        name: 'Experience',
        kicker: 'Research, decisions, results',
        items: [
          {
            title: 'Ditto AI',
            meta: 'Product Manager Intern · Jun 2026 – Present',
            text: 'Analyzed 12,000 sign-ups and interviewed users across four onboarding segments. With design and engineering, I removed six low-value prompts; questionnaire completion rose 11 percentage points in the first rollout cohort. I also designed a pair-level A/B test for 1,000 eligible pairs and used survival analysis to investigate delays to first dates.',
          },
          {
            title: 'Simeio',
            meta: 'Product Analyst · Jun – Aug 2025',
            text: 'Queried 620 application-onboarding requests in SQL and helped define an owner-assignment pilot with design and engineering. I wrote a PRD and 11 acceptance criteria covering permissions, audit history, and error states. Across 120 requests compared before and during the pilot, 48-hour owner confirmation rose from 52% to 74%.',
          },
        ],
      },
      {
        id: 'competitions',
        name: 'Competitions',
        kicker: 'Decisions under pressure',
        items: [
          {
            title: 'Drop Filler · 1st place',
            meta: 'National Product Case Competition · Ditto AI',
            text: 'Led product strategy for a five-day post-match SMS concept, setting activation and first-date conversion KPIs and an A/B plan for timing, prompts, and compatibility reveals.',
          },
          {
            title: 'Decision Vault · 1st place',
            meta: 'NYU Product Management Club · Salesforce',
            text: 'Led a four-person team to prototype an Agentforce governance layer that routes risky actions to human approval and preserves source-linked logs and audit exports.',
          },
          {
            title: 'Awareness Mode · 2nd place',
            meta: 'NYU Product Management Club · Intercollegiate PM Competition',
            text: 'Prototyped a digital wellness mode using motion and Screen Time cues; used 20 interviews and a weighted scorecard to select six features.',
          },
        ],
      },
    ],
  },
  {
    id: 'personal',
    name: 'Personal',
    blurb: 'Music, climbing, running and woodworking.',
    planets: [
      { id: 'music', name: 'Music', kicker: 'Guitar and karaoke', items: [{ title: 'Playing guitar and singing karaoke.', text: 'Stories and recordings coming soon.' }] },
      { id: 'climbing', name: 'Climbing', kicker: 'On the wall', items: [{ title: 'Rock climbing.', text: 'Stories and photos coming soon.' }] },
      { id: 'running', name: 'Running', kicker: 'Miles and mornings', items: [{ title: 'Running.', text: 'Stories and routes coming soon.' }] },
      { id: 'woodworking', name: 'Woodworking', kicker: 'Made by hand', items: [{ title: 'Woodworking.', text: 'Builds and photos coming soon.' }] },
    ],
  },
];
