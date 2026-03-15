export const PERSONAL = {
  name: 'Varun Ragunathan',
  title: 'Staff Software Engineer',
  domain: 'Identity & Authentication',
  location: 'Pleasanton, CA',
  email: 'ragunathanvarun@gmail.com',
  github: 'https://github.com/varunragunathan',
  linkedin: 'https://www.linkedin.com/in/varun-ragunathan',
  site: 'https://varunr.dev',
};

export const STATS = [
  { value: 135, suffix: 'M+', label: 'Users served' },
  { value: 700, suffix: 'M+', label: 'Monthly visits' },
  { value: 100, suffix: 'M+', label: 'Revenue impact ($)' },
  { value: 98, suffix: '%', label: 'Passkey success' },
];

export const PROJECTS = [
  {
    role: 'Frontend Architecture Lead',
    title: 'Passkey Authentication Platform',
    description: "Designed eBay's passkey eligibility detection module and led UI architecture from POC to production. Reduced integration time from 3 months to 1 week. 98% authentication success vs ~70% for passwords.",
    metrics: ['$20M+ annual revenue', '98% auth success', '135M+ users'],
    tags: ['WebAuthn', 'Passkeys', 'Node.js', 'Marko', 'Risk-based Auth'],
    featured: true,
  },
  {
    role: 'AI Engineering Lead',
    title: 'AI-First Development Workflow',
    description: 'Drove adoption of AI-assisted engineering across the Identity team — 0% to 80% AI usage. Production deploys now take under 2 hours.',
    metrics: ['0→80% AI adoption', '<2hr deploys'],
    tags: ['GitHub Copilot', 'Claude', 'GitHub Actions', 'Process Design'],
  },
  {
    role: 'UI Architecture Lead',
    title: 'Sign-in Platform Migration',
    description: "Led migration of eBay's sign-in from Java to Node.js + Marko. Zero production incidents. Personalized auth flows driving $40M+ annual revenue.",
    metrics: ['$40M+ revenue', 'Zero incidents'],
    tags: ['Marko', 'Node.js', 'OAuth2', 'Migration'],
  },
  {
    role: 'Platform Architect',
    title: 'MFA Enrollment Framework',
    description: 'Architected plug-and-play 2FA enrollment modal embeddable across eBay surfaces. Reduced integration from months to days.',
    metrics: ['28% enrollment lift', '$1.5M saved'],
    tags: ['React', 'Marko', 'TOTP', 'Security'],
  },
  {
    role: 'Developer Velocity Lead',
    title: 'CI/CD Velocity Initiative',
    description: 'Eliminated manual rollout steps. Commit to first box in <90 minutes. Full production rollout in under 2 hours.',
    metrics: ['Days→<2hrs', '100K–300K RPS'],
    tags: ['CI/CD', 'Automation', 'Release Eng'],
  },
];

export const SKILLS = [
  { group: 'Identity & Auth', items: ['WebAuthn / Passkeys', 'OAuth2 / OIDC', 'TOTP / Push Auth', 'Risk-based Auth', 'CSRF / XSS Defense'] },
  { group: 'Frontend', items: ['React', 'Marko', 'TypeScript', 'Accessibility (WCAG)', 'Component Systems'] },
  { group: 'Platform', items: ['Node.js', 'CI/CD Pipelines', 'Grafana / Kibana', 'REST APIs', 'Developer Tools'] },
  { group: 'Leadership', items: ['Architecture Reviews', 'AI Adoption (0→80%)', '30+ Tech Talks', '20+ Mentored', 'Tiger Team Lead'] },
];

export const PRINCIPLES = [
  {
    icon: '◇',
    title: 'Systems over features',
    body: "I don't build login pages. I architect authentication platforms serving 135M users at 300K RPS. The difference is the tradeoffs you consider before writing line one.",
  },
  {
    icon: '◈',
    title: 'Prototype to prove, then scale',
    body: '20+ hackweek projects, 3 wins, most went to production. I build the POC, prove the value, then design the system. The fastest path to conviction is working software.',
  },
  {
    icon: '◉',
    title: 'Multiply the team',
    body: "30+ internal talks. 20+ engineers mentored. 0→80% AI adoption. My highest-leverage output isn't code — it's the velocity I create for everyone around me.",
  },
];

export const TIMELINE = [
  { period: '2023 – 2025', title: 'Staff Software Engineer', company: 'eBay · Identity Platform', note: 'Frontend architecture lead. Passkeys, AI-first workflows, developer velocity.' },
  { period: '2019 – 2023', title: 'Senior Software Engineer', company: 'eBay · Identity & Sign-in', note: 'WebAuthn POC to production. Sign-in migration. Social login. $60M+ revenue impact.' },
  { period: '2014 – 2019', title: 'Software Engineer', company: 'eBay · Mobile & Platforms', note: 'Shake-to-Report. SEEK survey platform. UI component system. Hackweek champion.' },
];

export const EDUCATION = [
  { degree: 'MS Computer Engineering', school: 'University of Florida · 2012–2014' },
  { degree: 'BE Electronics & Communication', school: 'College of Engineering Guindy · 2008–2012' },
];
