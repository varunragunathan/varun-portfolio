// ── Course Data ────────────────────────────────────────────────────
// Each module has lessons (content slides) and a quiz.
// Completing a module awards vCoins.

import { LLM_DEEP_DIVE } from './llm-deep-dive';
import { FRONTEND_INTERVIEW_COURSES } from './frontend-interview';

export const COURSES = [
  {
    id: 'ai-ml-101',
    title: 'AI / ML 101',
    subtitle: 'From zero to intuition — no PhD required',
    description:
      'A ground-up introduction to Artificial Intelligence and Machine Learning. Learn what AI actually is, how models learn from data, and why everyone is talking about neural networks.',
    accent: '#7c3aed',
    accentRgb: '124,58,237',
    icon: '🧠',
    totalVCoins: 150,
    modules: [
      // ── Module 1 ──────────────────────────────────────────────────
      {
        id: 'what-is-ai',
        title: 'What Is AI?',
        icon: '🤖',
        vCoins: 20,
        lessons: [
          {
            type: 'content',
            title: 'The Big Picture',
            body: `**Artificial Intelligence** is the science of making machines do things that would require intelligence if done by humans.\n\nIt's not magic — it's math, data, and clever engineering.`,
            visual: 'brain-network',
          },
          {
            type: 'content',
            title: 'AI vs ML vs DL',
            body: `Think of it as nested circles:\n\n• **AI** — the broadest category (any smart-seeming system)\n• **Machine Learning** — AI that learns from data instead of being explicitly programmed\n• **Deep Learning** — ML using neural networks with many layers`,
            visual: 'nested-circles',
          },
          {
            type: 'content',
            title: 'A Brief History',
            body: `**1950** — Alan Turing asks "Can machines think?"\n**1956** — The term "AI" is coined at Dartmouth\n**1997** — Deep Blue beats Kasparov at chess\n**2012** — AlexNet crushes ImageNet (deep learning boom)\n**2022** — ChatGPT brings LLMs mainstream`,
            visual: 'timeline',
          },
        ],
        quiz: [
          {
            question: 'Which of these is the broadest category?',
            options: ['Deep Learning', 'Machine Learning', 'Artificial Intelligence', 'Neural Networks'],
            correct: 2,
            explanation: 'AI is the umbrella term. ML and DL are subsets of AI.',
          },
          {
            question: 'When was the term "Artificial Intelligence" first coined?',
            options: ['1943', '1950', '1956', '1997'],
            correct: 2,
            explanation: 'The term was coined at the Dartmouth Conference in 1956.',
          },
        ],
      },

      // ── Module 2 ──────────────────────────────────────────────────
      {
        id: 'how-machines-learn',
        title: 'How Machines Learn',
        icon: '📊',
        vCoins: 25,
        lessons: [
          {
            type: 'content',
            title: 'Data Is the Fuel',
            body: `ML models don't think — they find **patterns in data**.\n\nThe more high-quality data you have, the better the model can generalize to new, unseen examples.`,
            visual: 'data-flow',
          },
          {
            type: 'content',
            title: 'Training Loop',
            body: `Every ML model learns via the same loop:\n\n1. **Predict** — guess an answer\n2. **Compare** — check against the real answer (loss)\n3. **Adjust** — tweak internal weights to reduce error\n4. **Repeat** — thousands or millions of times`,
            visual: 'training-loop',
          },
          {
            type: 'interactive',
            title: 'Try It: Gradient Descent',
            body: `Drag the slider to adjust the model's weight.\nWatch the **loss** decrease as you get closer to the correct value.\n\nThis is gradient descent — finding the bottom of the loss curve.`,
            interactive: 'gradient-descent',
          },
        ],
        quiz: [
          {
            question: 'What does a ML model try to minimize during training?',
            options: ['Data', 'Features', 'Loss', 'Accuracy'],
            correct: 2,
            explanation: 'The loss (error) function measures how wrong the model is. Training minimizes it.',
          },
          {
            question: 'What are the steps of the training loop in order?',
            options: [
              'Compare → Predict → Repeat → Adjust',
              'Predict → Compare → Adjust → Repeat',
              'Adjust → Predict → Compare → Repeat',
              'Repeat → Adjust → Predict → Compare',
            ],
            correct: 1,
            explanation: 'The model first predicts, then compares its prediction to the truth, adjusts weights, and repeats.',
          },
        ],
      },

      // ── Module 3 ──────────────────────────────────────────────────
      {
        id: 'types-of-ml',
        title: 'Types of ML',
        icon: '🔀',
        vCoins: 25,
        lessons: [
          {
            type: 'content',
            title: 'Supervised Learning',
            body: `The model learns from **labeled examples**.\n\nYou give it inputs AND the correct outputs. It learns the mapping.\n\n**Examples:** spam detection, image classification, price prediction`,
            visual: 'supervised',
          },
          {
            type: 'content',
            title: 'Unsupervised Learning',
            body: `The model finds **hidden structure** in unlabeled data.\n\nNo correct answers provided — the model discovers patterns on its own.\n\n**Examples:** customer segmentation, anomaly detection, topic modeling`,
            visual: 'unsupervised',
          },
          {
            type: 'content',
            title: 'Reinforcement Learning',
            body: `The model learns by **trial and error**, receiving rewards or penalties.\n\nLike training a dog — good behavior gets treats.\n\n**Examples:** game-playing AI, robotics, recommendation systems`,
            visual: 'reinforcement',
          },
        ],
        quiz: [
          {
            question: 'Which type of ML uses labeled data?',
            options: ['Unsupervised', 'Reinforcement', 'Supervised', 'Semi-supervised'],
            correct: 2,
            explanation: 'Supervised learning requires labeled examples — inputs paired with correct outputs.',
          },
          {
            question: 'A robot learning to walk by trial and error is an example of:',
            options: ['Supervised Learning', 'Unsupervised Learning', 'Reinforcement Learning', 'Transfer Learning'],
            correct: 2,
            explanation: 'Reinforcement learning agents learn through rewards and penalties from trial and error.',
          },
        ],
      },

      // ── Module 4 ──────────────────────────────────────────────────
      {
        id: 'neural-networks',
        title: 'Neural Networks',
        icon: '🕸️',
        vCoins: 30,
        lessons: [
          {
            type: 'content',
            title: 'Inspired by Biology',
            body: `Neural networks are loosely inspired by the brain.\n\nA **neuron** takes inputs, applies weights, sums them up, and passes the result through an **activation function**.`,
            visual: 'neuron',
          },
          {
            type: 'content',
            title: 'Layers & Depth',
            body: `Networks are organized in **layers**:\n\n• **Input layer** — receives raw data\n• **Hidden layers** — where the magic happens\n• **Output layer** — produces the prediction\n\nMore layers = "deeper" network = **Deep Learning**`,
            visual: 'layers',
          },
          {
            type: 'interactive',
            title: 'Build a Neuron',
            body: `Toggle the inputs on/off and adjust the weights.\nWatch how the neuron's output changes.\n\nThis is the fundamental building block of every neural network.`,
            interactive: 'neuron-builder',
          },
        ],
        quiz: [
          {
            question: 'What makes a neural network "deep"?',
            options: [
              'It uses a lot of data',
              'It has many hidden layers',
              'It runs on GPUs',
              'It uses reinforcement learning',
            ],
            correct: 1,
            explanation: '"Deep" in deep learning refers to the depth (number of hidden layers) of the network.',
          },
          {
            question: 'What does an activation function do?',
            options: [
              'Loads the training data',
              'Decides whether a neuron should fire',
              'Splits data into train/test sets',
              'Visualizes the model',
            ],
            correct: 1,
            explanation: 'Activation functions introduce non-linearity, determining whether a neuron\'s output activates.',
          },
        ],
      },

      // ── Module 5 ──────────────────────────────────────────────────
      {
        id: 'real-world-ai',
        title: 'AI in the Real World',
        icon: '🌍',
        vCoins: 25,
        lessons: [
          {
            type: 'content',
            title: 'Computer Vision',
            body: `AI that **sees**.\n\nConvolutional Neural Networks (CNNs) power:\n• Self-driving cars\n• Medical imaging\n• Face recognition\n• Quality inspection in factories`,
            visual: 'vision',
          },
          {
            type: 'content',
            title: 'Natural Language Processing',
            body: `AI that **reads and writes**.\n\nTransformer models power:\n• ChatGPT & Claude\n• Translation\n• Sentiment analysis\n• Code generation`,
            visual: 'nlp',
          },
          {
            type: 'content',
            title: 'Generative AI',
            body: `AI that **creates**.\n\nModels that generate new content:\n• **Text** — LLMs (GPT, Claude, Gemini)\n• **Images** — Diffusion models (DALL-E, Midjourney)\n• **Code** — Copilot, Cursor\n• **Audio** — Music & voice synthesis`,
            visual: 'generative',
          },
        ],
        quiz: [
          {
            question: 'What type of neural network is commonly used for image tasks?',
            options: ['RNN', 'CNN', 'GAN', 'Transformer'],
            correct: 1,
            explanation: 'Convolutional Neural Networks (CNNs) are designed for spatial data like images.',
          },
          {
            question: 'What architecture powers modern LLMs like GPT and Claude?',
            options: ['Convolutional', 'Recurrent', 'Transformer', 'Bayesian'],
            correct: 2,
            explanation: 'The Transformer architecture (introduced in 2017) is the foundation of modern LLMs.',
          },
        ],
      },

      // ── Module 6 ──────────────────────────────────────────────────
      {
        id: 'ethics-and-frontier',
        title: 'Ethics & the Frontier',
        icon: '⚖️',
        vCoins: 25,
        lessons: [
          {
            type: 'content',
            title: 'Bias & Fairness',
            body: `AI models learn from data — and data reflects **human biases**.\n\n**Real cases:**\n• Hiring algorithms discriminating by gender\n• Facial recognition failing on darker skin tones\n• Credit scoring penalizing zip codes correlated with race\n\nFairness isn't automatic — it must be engineered.`,
            visual: 'fairness',
          },
          {
            type: 'content',
            title: 'Responsible AI',
            body: `Building AI responsibly means:\n\n• **Transparency** — explain how decisions are made\n• **Accountability** — humans stay in the loop\n• **Privacy** — protect user data\n• **Safety** — prevent harmful outputs\n• **Equity** — ensure fair outcomes across groups`,
            visual: 'responsible',
          },
          {
            type: 'content',
            title: "What's Next?",
            body: `The frontier is moving fast:\n\n🔬 **Multimodal models** — text + image + audio in one model\n🤝 **AI agents** — models that can take actions in the world\n💡 **Reasoning models** — chain-of-thought problem solving\n🏗️ **AI infrastructure** — making AI reliable at scale\n\nThe best time to understand AI is right now.`,
            visual: 'frontier',
          },
        ],
        quiz: [
          {
            question: 'Why can AI models exhibit bias?',
            options: [
              'They are programmed to be biased',
              'They learn patterns from biased data',
              'Bias is introduced during deployment',
              'Only small models have bias',
            ],
            correct: 1,
            explanation: 'Models learn from data, and if the data contains historical biases, the model will learn them too.',
          },
          {
            question: 'Which is NOT a principle of Responsible AI?',
            options: ['Transparency', 'Maximum profit', 'Accountability', 'Privacy'],
            correct: 1,
            explanation: 'Responsible AI focuses on transparency, accountability, privacy, safety, and equity — not profit maximization.',
          },
        ],
      },
    ],
  },
  LLM_DEEP_DIVE,
  ...FRONTEND_INTERVIEW_COURSES,
];
