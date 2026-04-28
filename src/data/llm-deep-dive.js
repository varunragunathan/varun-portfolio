// ── LLM Deep Dive Course ──────────────────────────────────────────
// 8 modules covering tokens, transformers, context windows,
// embeddings, training, inference, RAG, and evals.

export const LLM_DEEP_DIVE = {
  id: 'llm-deep-dive',
  title: 'LLM Deep Dive',
  subtitle: 'How large language models actually work under the hood',
  description:
    'Go beyond the surface. Understand tokenization, embeddings, the Transformer architecture, context windows, scaling laws, prompt engineering, RAG, and evaluation — the real engineering behind modern AI.',
  accent: '#f59e0b',
  accentRgb: '245,158,11',
  icon: '⚡',
  totalVCoins: 280,
  modules: [
    // ── Module 1: Tokens & Tokenization ─────────────────────────
    {
      id: 'tokens-tokenization',
      title: 'Tokens & Tokenization',
      icon: '🔤',
      vCoins: 30,
      lessons: [
        {
          type: 'content',
          title: 'Why Tokenization Matters',
          body: `LLMs don't read text the way you do. Before any processing, text must be converted into **tokens** — the atomic units the model understands.\n\nA token might be a word, part of a word, or even a single character. The tokenizer is the first and last component in every LLM pipeline.`,
          visual: 'token-pipeline',
        },
        {
          type: 'content',
          title: 'Byte-Pair Encoding (BPE)',
          body: `Most modern LLMs use **BPE** or variants:\n\n1. Start with individual characters\n2. Find the most frequent adjacent pair\n3. Merge them into a new token\n4. Repeat thousands of times\n\nThis creates a vocabulary of ~32K–100K tokens that balances efficiency with coverage.\n\n**"unhappiness"** → ["un", "happiness"] (2 tokens)\n**"ChatGPT"** → ["Chat", "G", "PT"] (3 tokens)`,
          visual: 'bpe-merge',
        },
        {
          type: 'interactive',
          title: 'Try It: Tokenizer',
          body: `Type any text below and see how it gets split into tokens.\n\nNotice: common words are single tokens, rare words get split into pieces, and spaces often attach to the following word.`,
          interactive: 'tokenizer',
        },
        {
          type: 'content',
          title: 'Token Economics',
          body: `Tokens directly impact **cost** and **speed**:\n\n• GPT-4o: ~$2.50 / 1M input tokens\n• Claude Opus: ~$15 / 1M input tokens\n• Gemini Flash: ~$0.075 / 1M input tokens\n\n**Rule of thumb:** 1 token ≈ ¾ of a word in English.\n100 tokens ≈ 75 words ≈ a short paragraph.\n\nLonger prompts = more tokens = higher cost + latency.`,
          visual: 'token-costs',
        },
      ],
      quiz: [
        {
          question: 'What is a token in the context of LLMs?',
          options: [
            'A complete sentence',
            'The atomic unit of text the model processes',
            'A type of neural network layer',
            'A security credential',
          ],
          correct: 1,
          explanation: 'Tokens are the smallest text units an LLM works with — they can be words, subwords, or characters.',
        },
        {
          question: 'What does BPE (Byte-Pair Encoding) do?',
          options: [
            'Encrypts text for security',
            'Iteratively merges frequent character pairs into tokens',
            'Converts tokens back to text',
            'Compresses images into bytes',
          ],
          correct: 1,
          explanation: 'BPE builds a vocabulary by repeatedly merging the most frequent adjacent pairs.',
        },
      ],
    },

    // ── Module 2: Embeddings & Vector Space ──────────────────────
    {
      id: 'embeddings-vectors',
      title: 'Embeddings & Vector Space',
      icon: '📐',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'From Tokens to Numbers',
          body: `Neural networks only understand numbers. **Embeddings** convert each token into a dense vector — a list of numbers (typically 768–12,288 dimensions).\n\nThese vectors capture **meaning**. Similar concepts end up close together in vector space.\n\n"king" → [0.21, -0.43, 0.87, ...]\n"queen" → [0.23, -0.41, 0.85, ...]`,
          visual: 'embedding-space',
        },
        {
          type: 'content',
          title: 'Semantic Arithmetic',
          body: `The famous result from Word2Vec (2013):\n\n**king − man + woman ≈ queen**\n\nEmbeddings capture relationships as directions in space:\n• Gender direction: man → woman\n• Royalty direction: person → royal\n• Tense direction: walk → walked\n\nThis is why LLMs can reason by analogy.`,
          visual: 'vector-arithmetic',
        },
        {
          type: 'interactive',
          title: 'Try It: Vector Similarity',
          body: `Explore how different words relate in embedding space.\n\nClick word pairs to see their **cosine similarity** — a measure of how close their meanings are (1.0 = identical, 0.0 = unrelated).`,
          interactive: 'vector-similarity',
        },
        {
          type: 'content',
          title: 'Positional Encoding',
          body: `Embeddings alone don't capture **word order**. "The cat sat on the mat" and "The mat sat on the cat" would look the same.\n\n**Positional encodings** add position information:\n• Original Transformer: sinusoidal functions\n• Modern LLMs: **RoPE** (Rotary Position Embedding)\n\nRoPE encodes relative positions, enabling better generalization to longer sequences.`,
          visual: 'positional-encoding',
        },
      ],
      quiz: [
        {
          question: 'What do embeddings represent?',
          options: [
            'The position of a word in a sentence',
            'Dense vectors that capture semantic meaning',
            'The frequency of a word in training data',
            'Binary encodings of characters',
          ],
          correct: 1,
          explanation: 'Embeddings map tokens to dense numerical vectors where proximity reflects semantic similarity.',
        },
        {
          question: 'Why are positional encodings needed?',
          options: [
            'To reduce computation cost',
            'To encrypt the input',
            'To give the model information about word order',
            'To compress the vocabulary',
          ],
          correct: 2,
          explanation: 'Without positional encodings, the model has no way to distinguish word order in a sequence.',
        },
      ],
    },

    // ── Module 3: The Transformer ───────────────────────────────
    {
      id: 'transformer-architecture',
      title: 'The Transformer',
      icon: '🏗️',
      vCoins: 40,
      lessons: [
        {
          type: 'content',
          title: 'Attention Is All You Need',
          body: `The 2017 paper that changed everything.\n\nBefore Transformers, sequence models (RNNs, LSTMs) processed tokens **one at a time** — slow and forgetful over long sequences.\n\nTransformers process **all tokens simultaneously** using a mechanism called **self-attention**.`,
          visual: 'transformer-arch',
        },
        {
          type: 'content',
          title: 'Self-Attention Mechanism',
          body: `For each token, self-attention asks: "How relevant is every other token to me?"\n\nThree learned projections per token:\n• **Q (Query)** — "What am I looking for?"\n• **K (Key)** — "What do I contain?"\n• **V (Value)** — "What information do I provide?"\n\n**Attention(Q, K, V) = softmax(QKᵀ / √d) · V**\n\nThe softmax creates a probability distribution — an attention pattern.`,
          visual: 'qkv-diagram',
        },
        {
          type: 'interactive',
          title: 'Try It: Attention Heatmap',
          body: `See how tokens attend to each other in a sentence.\n\nClick different tokens to see their attention pattern — which other words does the model focus on to understand this token?`,
          interactive: 'attention-heatmap',
        },
        {
          type: 'content',
          title: 'Multi-Head Attention',
          body: `One attention head captures one type of relationship. **Multi-head attention** runs several in parallel:\n\n• Head 1 might track syntactic structure\n• Head 2 might track coreference ("he" → "John")\n• Head 3 might track semantic similarity\n\nModern LLMs use 32–128 attention heads per layer, stacked 32–80 layers deep.\n\n**GPT-4:** ~96 layers, ~96 heads\n**Llama 3 70B:** 80 layers, 64 heads`,
          visual: 'multi-head',
        },
        {
          type: 'content',
          title: 'Feed-Forward & Layer Norm',
          body: `Each Transformer layer has two sub-layers:\n\n1. **Multi-Head Attention** — mix information across tokens\n2. **Feed-Forward Network (FFN)** — process each token independently\n\nBoth use **residual connections** (add the input back) and **layer normalization** for stable training.\n\nThe FFN is where much of the model's "knowledge" is stored — it's typically 4x wider than the attention layer.`,
          visual: 'ffn-residual',
        },
      ],
      quiz: [
        {
          question: 'What are Q, K, and V in self-attention?',
          options: [
            'Quantize, Kernel, Validate',
            'Query, Key, Value',
            'Queue, Keep, Verify',
            'Quick, Know, Vector',
          ],
          correct: 1,
          explanation: 'Query, Key, and Value are the three projections used to compute attention scores.',
        },
        {
          question: 'Why do Transformers use multiple attention heads?',
          options: [
            'To reduce memory usage',
            'To capture different types of relationships simultaneously',
            'To process tokens sequentially',
            'To avoid using GPUs',
          ],
          correct: 1,
          explanation: 'Each head can learn a different type of linguistic relationship (syntax, coreference, semantics, etc.).',
        },
        {
          question: 'Where is most of a Transformer\'s learned knowledge stored?',
          options: [
            'The tokenizer',
            'The attention layers',
            'The feed-forward networks (FFN)',
            'The positional encodings',
          ],
          correct: 2,
          explanation: 'Research suggests that FFN layers store factual knowledge, while attention handles relational reasoning.',
        },
      ],
    },

    // ── Module 4: Context Windows ───────────────────────────────
    {
      id: 'context-windows',
      title: 'Context Windows & Memory',
      icon: '📏',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'What Is a Context Window?',
          body: `The **context window** is the maximum number of tokens a model can process at once — its "working memory."\n\n**Context lengths today:**\n• GPT-4o: 128K tokens (~96K words)\n• Claude Opus 4: 200K tokens (~150K words)\n• Gemini 2.5: 1M tokens (~750K words)\n\nThis includes **both** your input AND the model's output.`,
          visual: 'context-window',
        },
        {
          type: 'interactive',
          title: 'Try It: Context Budget',
          body: `Adjust the input and output lengths to see how they consume the context window.\n\nNotice: a long system prompt + conversation history can leave very little room for the model's response.`,
          interactive: 'context-budget',
        },
        {
          type: 'content',
          title: 'KV Cache',
          body: `During generation, the model produces tokens **one at a time**. Without optimization, it would recompute attention over all previous tokens each step.\n\nThe **KV Cache** stores the Key and Value matrices from previous tokens so they don't need to be recomputed.\n\n**Trade-off:** KV cache uses lots of GPU memory.\n• 128K context on a 70B model ≈ 40GB just for KV cache\n• This is why long-context inference is expensive`,
          visual: 'kv-cache',
        },
        {
          type: 'content',
          title: 'Long Context Strategies',
          body: `How do you work with information that exceeds the context window?\n\n**Retrieval-Augmented Generation (RAG)**\nSearch a vector database for relevant chunks, inject into context.\n\n**Sliding Window Attention**\nOnly attend to nearby tokens + a few global tokens.\n\n**Summarization Chains**\nCompression: summarize chunks, then reason over summaries.\n\n**"Lost in the Middle"**\nResearch shows models pay more attention to the **beginning** and **end** of the context — information in the middle gets less attention.`,
          visual: 'long-context',
        },
      ],
      quiz: [
        {
          question: 'What does the context window include?',
          options: [
            'Only the user\'s input',
            'Only the model\'s output',
            'Both input and output tokens',
            'The training data',
          ],
          correct: 2,
          explanation: 'The context window is shared between input (prompt) and output (completion) tokens.',
        },
        {
          question: 'What is the KV Cache used for?',
          options: [
            'Storing the training data',
            'Caching Key/Value matrices to avoid recomputation during generation',
            'Compressing the model weights',
            'Encrypting the output',
          ],
          correct: 1,
          explanation: 'The KV cache stores previously computed Key and Value tensors so attention doesn\'t need to be recomputed for each new token.',
        },
      ],
    },

    // ── Module 5: Training at Scale ─────────────────────────────
    {
      id: 'training-at-scale',
      title: 'Training at Scale',
      icon: '🏋️',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Pre-Training',
          body: `The foundation: train on **trillions of tokens** from the internet.\n\nObjective: **next-token prediction**\nGiven "The cat sat on the ___", predict "mat".\n\nDoing this trillions of times teaches the model grammar, facts, reasoning patterns, and code.\n\n**Cost:** Llama 3 405B used ~30M GPU-hours ≈ $100M+\n**Data:** ~15 trillion tokens of filtered web text`,
          visual: 'pretraining',
        },
        {
          type: 'content',
          title: 'Scaling Laws',
          body: `The **Chinchilla scaling law** (2022) showed:\n\nModel performance is a predictable function of:\n• **N** — number of parameters\n• **D** — dataset size (tokens)\n• **C** — compute budget (FLOPs)\n\n**Key insight:** For a given compute budget, there's an optimal balance between model size and data.\n\nDouble the compute → ~5% improvement in loss\nThis predictability lets labs plan billion-dollar training runs.`,
          visual: 'scaling-laws',
        },
        {
          type: 'content',
          title: 'Fine-Tuning & RLHF',
          body: `Pre-training creates a capable but unaligned model. Alignment happens in stages:\n\n**SFT (Supervised Fine-Tuning)**\nTrain on high-quality (prompt, response) pairs written by humans.\n\n**RLHF (Reinforcement Learning from Human Feedback)**\n1. Humans rank model outputs\n2. Train a reward model on those rankings\n3. Use PPO to optimize the LLM against the reward model\n\n**DPO (Direct Preference Optimization)**\nSkips the reward model — directly optimizes from preference pairs. Simpler, increasingly popular.`,
          visual: 'rlhf-pipeline',
        },
        {
          type: 'content',
          title: 'Distributed Training',
          body: `Training a 405B-parameter model requires **thousands of GPUs** working together:\n\n**Data Parallelism** — same model on each GPU, different data batches\n**Tensor Parallelism** — split individual layers across GPUs\n**Pipeline Parallelism** — different layers on different GPUs\n**ZeRO** — partition optimizer states across GPUs\n\nAll must communicate via high-speed interconnects (NVLink, InfiniBand).\n\nA single GPU failure can halt a multi-million-dollar training run.`,
          visual: 'distributed-training',
        },
      ],
      quiz: [
        {
          question: 'What is the primary objective during pre-training?',
          options: [
            'Answering user questions',
            'Next-token prediction',
            'Image generation',
            'Reinforcement learning',
          ],
          correct: 1,
          explanation: 'Pre-training uses next-token prediction (causal language modeling) on massive text corpora.',
        },
        {
          question: 'What does RLHF stand for?',
          options: [
            'Recursive Language Heuristic Framework',
            'Reinforcement Learning from Human Feedback',
            'Regression Loss with Hybrid Features',
            'Rapid Learning through Hierarchical Fusion',
          ],
          correct: 1,
          explanation: 'RLHF uses human preference data to fine-tune models for helpfulness, harmlessness, and honesty.',
        },
      ],
    },

    // ── Module 6: Inference & Sampling ───────────────────────────
    {
      id: 'inference-sampling',
      title: 'Inference & Sampling',
      icon: '🎲',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'How Generation Works',
          body: `At each step, the model outputs a **probability distribution** over all ~100K tokens in its vocabulary.\n\nGeneration = repeatedly sampling from this distribution:\n1. Run forward pass → get logits for next token\n2. Apply temperature and sampling strategy\n3. Pick a token\n4. Append it to the sequence\n5. Repeat until stop token or max length`,
          visual: 'generation-loop',
        },
        {
          type: 'interactive',
          title: 'Try It: Temperature',
          body: `Adjust the **temperature** to see how it affects token probabilities.\n\n• **Low temperature (0.0–0.3):** Deterministic, picks the most likely token\n• **Medium (0.7–1.0):** Balanced creativity\n• **High (1.5+):** Wild, unpredictable outputs`,
          interactive: 'temperature-slider',
        },
        {
          type: 'content',
          title: 'Sampling Strategies',
          body: `Beyond temperature, several strategies control output quality:\n\n**Top-K Sampling**\nOnly consider the top K most likely tokens. K=50 is common.\n\n**Top-P (Nucleus) Sampling**\nConsider tokens until cumulative probability reaches P. P=0.95 means the top 95% of probability mass.\n\n**Min-P Sampling**\nDrop any token with probability < P × max_probability. More adaptive than Top-K.\n\n**Beam Search**\nKeep N best partial sequences. Used for translation, less for chat.`,
          visual: 'sampling-strategies',
        },
        {
          type: 'content',
          title: 'Structured Output',
          body: `For production systems, free-form text isn't enough. You need **structured output**:\n\n**JSON Mode**\nConstrain the model to output valid JSON.\n\n**Grammar-Based Sampling**\nUse a formal grammar (GBNF) to restrict which tokens are valid at each step.\n\n**Tool/Function Calling**\nThe model outputs structured function calls that your code executes.\n\nThis is how LLMs become reliable engineering primitives, not just text generators.`,
          visual: 'structured-output',
        },
      ],
      quiz: [
        {
          question: 'What does a low temperature (e.g., 0.1) do?',
          options: [
            'Makes output more random and creative',
            'Makes the model hallucinate more',
            'Makes output more deterministic and focused',
            'Speeds up inference',
          ],
          correct: 2,
          explanation: 'Low temperature sharpens the probability distribution, making the model pick the most likely tokens.',
        },
        {
          question: 'What is Top-P (Nucleus) sampling?',
          options: [
            'Picking the single most likely token',
            'Sampling from tokens that cover P% of cumulative probability',
            'Using P different models and voting',
            'Processing P tokens at a time',
          ],
          correct: 1,
          explanation: 'Top-P dynamically selects the smallest set of tokens whose cumulative probability exceeds P.',
        },
      ],
    },

    // ── Module 7: RAG & Tool Use ────────────────────────────────
    {
      id: 'rag-tool-use',
      title: 'RAG & Tool Use',
      icon: '🔧',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Retrieval-Augmented Generation',
          body: `LLMs have a knowledge cutoff and can hallucinate. **RAG** solves both:\n\n1. **Index** — embed your documents into a vector database\n2. **Retrieve** — given a query, find the most relevant chunks via similarity search\n3. **Augment** — inject retrieved chunks into the prompt\n4. **Generate** — the model answers using the provided context\n\nRAG gives LLMs access to fresh, private, or domain-specific data without fine-tuning.`,
          visual: 'rag-pipeline',
        },
        {
          type: 'content',
          title: 'Vector Databases & Chunking',
          body: `**Vector databases** store embeddings for fast similarity search:\n• Pinecone, Weaviate, Qdrant, pgvector, Chroma\n\n**Chunking strategies** determine how you split documents:\n• **Fixed-size** — 512 tokens with 50-token overlap\n• **Semantic** — split at paragraph/section boundaries\n• **Recursive** — try large chunks, fall back to smaller\n\n**Chunk size trade-off:**\nSmall chunks = precise retrieval, less context\nLarge chunks = more context, noisier retrieval`,
          visual: 'vector-db',
        },
        {
          type: 'content',
          title: 'Function Calling & Agents',
          body: `**Function/Tool calling** lets models invoke external functions:\n\n\`\`\`\nUser: "What's the weather in SF?"\nModel → calls: get_weather(city="San Francisco")\nSystem → returns: {temp: 62, conditions: "foggy"}\nModel: "It's 62°F and foggy in San Francisco."\n\`\`\`\n\n**Agents** chain multiple tool calls with reasoning:\n1. Observe the task\n2. Think about what tool to use\n3. Act (call the tool)\n4. Observe the result\n5. Repeat until done\n\nThis is the **ReAct** (Reasoning + Acting) pattern.`,
          visual: 'agent-loop',
        },
      ],
      quiz: [
        {
          question: 'What problem does RAG primarily solve?',
          options: [
            'Making models generate faster',
            'Giving models access to external/current knowledge',
            'Reducing model parameter count',
            'Training models from scratch',
          ],
          correct: 1,
          explanation: 'RAG augments the model\'s fixed knowledge with retrieved, up-to-date, or domain-specific information.',
        },
        {
          question: 'In the ReAct pattern, what does an agent alternate between?',
          options: [
            'Training and inference',
            'Encoding and decoding',
            'Reasoning and acting',
            'Compression and expansion',
          ],
          correct: 2,
          explanation: 'ReAct agents alternate between reasoning (thinking about what to do) and acting (executing tools).',
        },
      ],
    },

    // ── Module 8: Evaluation & Safety ───────────────────────────
    {
      id: 'evals-safety',
      title: 'Evaluation & Safety',
      icon: '🛡️',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'How Do You Measure an LLM?',
          body: `Evaluating LLMs is fundamentally hard — there's no single metric.\n\n**Benchmarks:**\n• **MMLU** — 57-subject multiple choice (knowledge breadth)\n• **HumanEval** — code generation correctness\n• **GSM8K** — grade-school math reasoning\n• **GPQA** — PhD-level science questions\n• **Arena Elo** — human preference rankings (Chatbot Arena)\n\n**The problem:** Models can overfit to benchmarks. Real-world performance often diverges.`,
          visual: 'benchmarks',
        },
        {
          type: 'content',
          title: 'Building Your Own Evals',
          body: `For production systems, **custom evals** matter most:\n\n**Assertion-based**\nDoes the output contain required fields? Is it valid JSON?\n\n**LLM-as-Judge**\nUse a strong model to grade a weaker model's output.\n\n**Human Evaluation**\nGold standard but expensive and slow.\n\n**Regression Testing**\nRun the same prompts across model versions. Did anything break?\n\n**The key insight:** Evals are the tests of AI engineering. No evals = no confidence.`,
          visual: 'custom-evals',
        },
        {
          type: 'content',
          title: 'Hallucination & Grounding',
          body: `**Hallucination**: the model generates plausible-sounding but false information.\n\n**Why it happens:**\n• The model optimizes for plausible next tokens, not truth\n• Training data contains contradictions\n• The model "fills in" when uncertain\n\n**Mitigation strategies:**\n• RAG — ground responses in retrieved facts\n• Citation — require the model to cite sources\n• Chain-of-thought — force explicit reasoning\n• Low temperature — reduce creative fabrication\n• Confidence calibration — "I'm not sure about..."`,
          visual: 'hallucination',
        },
        {
          type: 'content',
          title: 'Safety & Alignment',
          body: `Making models safe is an ongoing engineering challenge:\n\n**Constitutional AI**\nTrain the model to self-critique against a set of principles.\n\n**Red Teaming**\nAdversarial testing to find failure modes.\n\n**Guardrails**\nInput/output filters that catch harmful content.\n\n**The alignment tax:**\nSafety measures can reduce capability. The goal is to make models both **capable** and **safe** — not one at the expense of the other.`,
          visual: 'safety-alignment',
        },
      ],
      quiz: [
        {
          question: 'Why is MMLU an imperfect benchmark?',
          options: [
            'It\'s too easy for modern models',
            'Models can overfit to it and real-world performance may differ',
            'It only tests code generation',
            'It requires human evaluation',
          ],
          correct: 1,
          explanation: 'Benchmark contamination and overfitting mean high scores don\'t always translate to real-world capability.',
        },
        {
          question: 'What is the primary cause of LLM hallucination?',
          options: [
            'Bugs in the code',
            'The model optimizes for plausible tokens, not factual truth',
            'Insufficient GPU memory',
            'Using too low a temperature',
          ],
          correct: 1,
          explanation: 'LLMs are trained to predict plausible continuations, which doesn\'t guarantee factual accuracy.',
        },
      ],
    },
  ],
};
