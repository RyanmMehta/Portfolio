// Projects pinned on the globe. Each one opens a small 3D world (`theme`,
// see js/places.js) built around a picture of the project.
//
// To show a real screenshot instead of the placeholder card, put the file in
// assets/projects/ and set `image`, e.g. image: 'assets/projects/mind-garden.png'.
// Set `portrait: true` for tall phone screenshots.

export const PROJECTS = [
  {
    id: 'mind-garden',
    name: 'Mind Garden',
    status: 'Live product',
    place: 'Jinhae, South Korea',
    lat: 35.15,
    lon: 128.66,
    theme: 'blossom',
    accent: '#ffb7cb',
    motto: 'Plant / Remember / Revisit',
    blurb:
      'A 3D journaling app I built to make reflection feel tangible. Every entry becomes a plant in an explorable world, growing from a sprout into a tree as you write.',
    link: { href: 'https://mindgardens.us/', label: 'Open Mind Garden' },
    image: null,
  },
  {
    id: 'growyourhabit',
    name: 'GrowYourHabit',
    status: 'Live MVP',
    place: 'Olympic Peninsula, USA',
    lat: 47.8,
    lon: -123.6,
    theme: 'forest',
    accent: '#9fe0a8',
    motto: 'Consistency > perfection',
    blurb:
      'An iPhone-first habit system that turns honest daily logs into a growing forest, with analytics that reveal when you work best.',
    link: { href: 'https://ryanos.pages.dev/', label: 'Open GrowYourHabit' },
    image: null,
    portrait: true,
  },
  {
    id: 'jobos',
    name: 'JobOS',
    status: 'Working prototype · private build',
    place: 'New York, USA',
    lat: 40.73,
    lon: -73.99,
    theme: 'city',
    accent: '#8fb8ff',
    motto: 'Track / Review / Follow up',
    blurb:
      'A review-first application manager that keeps submissions, follow-ups, and resume versions in one auditable workflow.',
    link: null,
    image: null,
  },
  {
    id: 'vocal-studio',
    name: 'Vocal Studio',
    status: 'Live MVP',
    place: 'Rio de Janeiro, Brazil',
    lat: -22.95,
    lon: -43.2,
    theme: 'stage',
    accent: '#d59bff',
    motto: 'Capture / Analyze / Arrange / Mix',
    blurb:
      'A private browser studio that analyzes a vocal idea, corrects pitch and timing, and builds a Pop or R&B arrangement around the take without uploading the audio.',
    link: { href: 'https://vocal-studio.rm6886.workers.dev/', label: 'Open Vocal Studio' },
    image: null,
  },
  {
    id: 'pantry',
    name: 'Pantry',
    status: 'Live MVP demo',
    place: 'Tuscany, Italy',
    lat: 43.35,
    lon: 11.3,
    theme: 'tuscany',
    accent: '#ffd27f',
    motto: 'Buy / Cook / Eat / Sync',
    blurb:
      'A kitchen operating system that connects inventory, meal prep, nutrition, and replenishment, and surfaces what is low or needs to be used soon.',
    link: { href: 'https://pantry-demo.rm6886.workers.dev/', label: 'Open the demo' },
    image: null,
  },
  {
    id: 'restaurant',
    name: 'Rest.aurant',
    status: 'Stealth project',
    place: 'Mumbai, India',
    lat: 19.08,
    lon: 72.88,
    theme: 'lanterns',
    accent: '#ff8a66',
    motto: 'Under wraps',
    blurb: 'A new project in stealth. More details to come.',
    link: null,
    image: null,
  },
];
