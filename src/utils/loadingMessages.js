// Quirky loading messages based on interview context
const topicHints = {
  frontend: ['Reviewing React patterns…', 'Pondering component architecture…', 'Thinking about state management…', 'Considering performance implications…'],
  backend: ['Designing the API…', 'Thinking about database schema…', 'Considering scaling…', 'Reviewing system design…'],
  'system-design': ['Sketching the architecture…', 'Considering tradeoffs…', 'Thinking about bottlenecks…', 'Planning the infrastructure…'],
  behavioral: ['Reflecting on that…', 'Considering the leadership angle…', 'Thinking about impact…', 'Evaluating the approach…'],
  dsa: ['Analyzing the algorithm…', 'Considering complexity…', 'Thinking about edge cases…', 'Evaluating the solution…'],
  fullstack: ['Bridging the layers…', 'Considering the full picture…', 'Thinking end-to-end…', 'Reviewing the flow…'],
  product: ['Analyzing the metrics…', 'Considering user needs…', 'Thinking about impact…', 'Evaluating the strategy…'],
};

export function getLoadingMessage(transcript, theme) {
  if (!transcript || transcript.length === 0) return 'Thinking…';

  // Try to pick a theme-specific hint
  const hints = topicHints[theme] || topicHints.frontend;
  const hint = hints[Math.floor(Math.random() * hints.length)];

  return hint;
}

