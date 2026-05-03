// ── Frontend Interview Prep Courses ──────────────────────────────
// Staff-level quick-refresh for front-end interviews.
// Topics: React, JavaScript Core, CSS & Layout, Accessibility,
//         Performance & Web Vitals, SEO Fundamentals.

// ── 1. React Deep Dive ───────────────────────────────────────────
const REACT_DEEP_DIVE = {
  id: 'react-interview',
  title: 'React Deep Dive',
  subtitle: 'Staff-level hooks, rendering, and patterns',
  description:
    'The React questions that separate staff engineers from seniors. Covers hooks internals, rendering behavior, state architecture, performance optimization, and modern patterns.',
  accent: '#61dafb',
  accentRgb: '97,218,251',
  icon: '⚛️',
  totalVCoins: 200,
  modules: [
    {
      id: 'react-hooks',
      title: 'Hooks Deep Dive',
      icon: '🪝',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Rules of Hooks',
          body: `Hooks have two rules:\n\n1. Only call hooks at the **top level** — never inside loops, conditions, or nested functions\n2. Only call hooks from **React function components** or custom hooks\n\nWhy? React relies on call order to associate each hook call with its state slot. A conditional hook call would shift every subsequent hook's slot on the next render.`,
          visual: 'hooks-rules',
        },
        {
          type: 'content',
          title: 'useEffect & Cleanup',
          body: `useEffect runs **after** the render is committed to the DOM.\n\n**Dependency array:**\n- \`[]\` — run once on mount only\n- \`[dep]\` — run when dep changes\n- omitted — run after every render\n\n**Cleanup:** return a function to cancel subscriptions, timers, or event listeners before the next effect fires or on unmount.\n\n\`\`\`js\nuseEffect(() => {\n  const id = setInterval(tick, 1000);\n  return () => clearInterval(id);\n}, []);\`\`\`\n\n**Common mistake:** putting async functions directly in useEffect — the return value must be a cleanup function, not a Promise.`,
          visual: 'effect-lifecycle',
        },
        {
          type: 'content',
          title: 'useCallback vs useMemo',
          body: `Both memoize to avoid unnecessary work on re-render.\n\n**useMemo** — caches a **computed value**:\n\`\`\`js\nconst sorted = useMemo(() => [...items].sort(compare), [items]);\`\`\`\n\n**useCallback** — caches a **function reference** (equivalent to \`useMemo(() => fn, deps)\`):\n\`\`\`js\nconst handleClick = useCallback(() => doThing(id), [id]);\`\`\`\n\n**When to use:** Passing to memoized children (React.memo), or as stable effect dependencies. Don't add them speculatively — they have their own cost.`,
          visual: 'memo-compare',
        },
        {
          type: 'content',
          title: 'useRef: More Than DOM',
          body: `useRef returns a mutable object (\`{ current: value }\`) that persists across renders **without** triggering re-renders.\n\n**DOM access:**\n\`\`\`js\nconst inputRef = useRef(null);\n<input ref={inputRef} />\ninputRef.current.focus();\`\`\`\n\n**Storing latest callback (stale closure fix):**\n\`\`\`js\nconst onChangeRef = useRef(onChange);\nuseEffect(() => { onChangeRef.current = onChange; });\n// then call onChangeRef.current() inside a stable callback\`\`\`\n\n**Storing previous value:** assign in an effect after render.`,
          visual: 'ref-uses',
        },
        {
          type: 'content',
          title: 'Custom Hooks',
          body: `Custom hooks extract stateful logic without changing the component hierarchy. They start with \`use\` by convention and can call other hooks.\n\n\`\`\`js\nfunction useDebounce(value, delay) {\n  const [debounced, setDebounced] = useState(value);\n  useEffect(() => {\n    const t = setTimeout(() => setDebounced(value), delay);\n    return () => clearTimeout(t);\n  }, [value, delay]);\n  return debounced;\n}\`\`\`\n\nThis is React's primary logic-reuse primitive — prefer it over render props or HOCs.`,
          visual: 'custom-hook',
        },
      ],
      quiz: [
        {
          question: 'Why must hooks be called at the top level, not inside conditions?',
          options: [
            'Performance reasons — conditional hooks are slower',
            'React tracks hooks by call order; conditions would break slot alignment',
            'It is only a style convention from the React team',
            'Hooks simply do not work inside if-statements at all',
          ],
          correct: 1,
          explanation: 'React relies on the stable call order of hooks to map each call to its internal state slot.',
        },
        {
          question: 'What is the correct way to run async work inside useEffect?',
          options: [
            'Pass an async function directly as the effect callback',
            'Define an async function inside the effect and call it',
            'Use useAsyncEffect from React',
            'Wrap the entire effect in Promise.resolve()',
          ],
          correct: 1,
          explanation: 'useEffect callbacks must return undefined or a cleanup function — never a Promise. Define and immediately call an async function inside.',
        },
        {
          question: 'Changing ref.current does NOT:',
          options: ['Persist across renders', 'Trigger a re-render', 'Survive the component staying mounted', 'Work with DOM nodes'],
          correct: 1,
          explanation: 'Mutation of ref.current is invisible to React — no re-render is scheduled. This is its key difference from state.',
        },
      ],
    },
    {
      id: 'react-rendering',
      title: 'Rendering & Reconciliation',
      icon: '🔄',
      vCoins: 40,
      lessons: [
        {
          type: 'content',
          title: 'What Triggers a Re-render',
          body: `A React component re-renders when:\n\n1. Its **own state** changes (useState / useReducer)\n2. Its **parent re-renders** (by default, all children re-render)\n3. A **context** it consumes changes\n\n**Key insight:** "Props changed" is a consequence, not a cause. The parent re-rendering produces new prop objects, which causes the child to re-render unless it is memoized.\n\n**React.memo** skips re-render when a parent re-renders but props are shallowly equal.`,
          visual: 'render-triggers',
        },
        {
          type: 'content',
          title: 'Virtual DOM & Reconciliation',
          body: `React maintains a **virtual DOM** — a lightweight JS tree.\n\nOn re-render:\n1. Creates a new virtual DOM tree\n2. **Diffs** it against the previous (reconciliation)\n3. Applies the **minimal patch** to the real DOM\n\n**Heuristics:**\n- Different element type → destroy and recreate the whole subtree\n- Same type → update changed attributes, recurse into children\n- Lists → match old vs new items using \`key\`\n\nThis is why a type change at the top resets all descendant state.`,
          visual: 'reconciliation',
        },
        {
          type: 'content',
          title: 'Keys Done Right',
          body: `Keys tell React which list items survived a re-render vs which are new or removed.\n\n✅ **Stable, unique IDs:**\n\`<Item key={item.id} />\`\n\n❌ **Array index** — breaks on reorder or insertion:\n\`<Item key={i} />\` — only safe for truly static lists\n\n❌ **Math.random()** — generates a new key every render, causing full unmount + remount on every update\n\n**Pro technique:** Intentionally change a key to force a full component reset (clears all internal state).`,
          visual: 'keys-vis',
        },
        {
          type: 'content',
          title: 'React Fiber & Concurrency',
          body: `**Fiber** is React's reconciliation engine (React 16+). Unlike the old synchronous renderer, Fiber can:\n- **Pause** rendering work and resume later\n- **Prioritize** urgent updates (user typing) over slow ones (data loading)\n- **Abort** stale renders when a newer update arrives\n\n**React 18 concurrent features:**\n- \`startTransition(fn)\` — mark state updates as non-urgent\n- \`useDeferredValue(val)\` — defer an expensive derived value\n- \`<Suspense>\` — show a fallback while async work completes`,
          visual: 'fiber-concurrent',
        },
      ],
      quiz: [
        {
          question: 'By default, when a parent component re-renders:',
          options: [
            'Only children whose props changed will re-render',
            'All children re-render regardless of prop changes',
            'Children only re-render if they use useState',
            'React skips children that have no state',
          ],
          correct: 1,
          explanation: "Without React.memo, ALL children re-render when the parent does — even if their props didn't change.",
        },
        {
          question: 'What is the main problem with using array index as a key in a dynamic list?',
          options: [
            'Numbers are slower to compare than strings',
            'React cannot handle numeric keys',
            'Components get the wrong state when items reorder or are inserted',
            'Index keys cause infinite re-render loops',
          ],
          correct: 2,
          explanation: 'Index keys are positional, not identity-based. On reorder, a component receives the state of whatever item sat at that index before.',
        },
        {
          question: 'startTransition is best used for:',
          options: [
            'Animating between pages',
            'Marking state updates that can be interrupted by more urgent work',
            'Replacing useEffect for data fetching',
            'Batching multiple setState calls',
          ],
          correct: 1,
          explanation: 'startTransition signals to React that the wrapped update is non-urgent — it can be interrupted if a higher-priority event arrives.',
        },
      ],
    },
    {
      id: 'react-state',
      title: 'State Architecture',
      icon: '🏗️',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Lifting State Up',
          body: `When two components need to share state, move it to their **lowest common ancestor** and pass it down as props.\n\nThis is React's fundamental data-sharing pattern and should be the first thing you reach for — before context, before external stores.\n\n**Colocation rule:** Keep state as close to where it is used as possible. Lifting too high causes unnecessary re-renders in the whole subtree.`,
          visual: 'lift-state',
        },
        {
          type: 'content',
          title: 'Context: When & Pitfalls',
          body: `Context solves **prop drilling** without lifting to external state.\n\n**Good use cases:** theme, locale, auth user, feature flags — data that changes infrequently\n\n**Pitfall:** Every context consumer re-renders when the value changes. Passing \`{ user, setUser }\` as a literal object re-creates it every render.\n\n**Fix:** Memoize the value:\n\`\`\`js\nconst value = useMemo(() => ({ user, setUser }), [user]);\n<AuthCtx.Provider value={value}>\`\`\`\n\nOr split into two contexts: one for the data, one for the setter.`,
          visual: 'context-pattern',
        },
        {
          type: 'content',
          title: 'useReducer for Complex State',
          body: `useReducer is preferable to useState when:\n- The next state depends on complex logic over the previous state\n- Multiple related fields update together\n- You want centralized, testable update logic\n\n\`\`\`js\nfunction reducer(state, action) {\n  switch (action.type) {\n    case 'increment': return { ...state, count: state.count + 1 };\n    case 'reset':     return initialState;\n    default:          return state;\n  }\n}\nconst [state, dispatch] = useReducer(reducer, initialState);\`\`\`\n\nReducers are pure functions — trivial to unit test without React.`,
          visual: 'reducer-pattern',
        },
        {
          type: 'content',
          title: 'External State: Choosing Wisely',
          body: `Reach for external state when:\n- State is shared across many unrelated components\n- You need derived/computed state read by many components\n- State is server-originated (async, cacheable)\n\n**Options:**\n- **Zustand** — minimal boilerplate, module-level stores\n- **Jotai** — atomic model, fine-grained subscriptions\n- **TanStack Query** — server state: caching, background refetch, optimistic updates\n- **Redux Toolkit** — large teams, strict patterns, excellent DevTools\n\n**Staff-level answer:** Know WHY you'd pick each, not just the API.`,
          visual: 'state-libs',
        },
      ],
      quiz: [
        {
          question: 'Context is a good choice for:',
          options: [
            'A stock ticker updating 10 times per second',
            'The authenticated user object that rarely changes',
            'A shopping cart with items changing on every interaction',
            'Sharing state between two adjacent siblings',
          ],
          correct: 1,
          explanation: 'Context re-renders ALL consumers on change. It suits infrequent data like auth state. For frequent changes, use a store with selector-based subscriptions.',
        },
        {
          question: 'The biggest performance pitfall with Context is:',
          options: [
            'Context is synchronous and blocks rendering',
            'Providing a new object literal causes all consumers to re-render every time the parent renders',
            'Context cannot be used with TypeScript',
            'Context values cannot contain functions',
          ],
          correct: 1,
          explanation: 'A new object reference — even with the same data — causes React to re-render every consumer. Memoize the context value to prevent this.',
        },
      ],
    },
    {
      id: 'react-performance',
      title: 'React Performance',
      icon: '⚡',
      vCoins: 40,
      lessons: [
        {
          type: 'content',
          title: 'React.memo',
          body: `React.memo wraps a component to **skip re-renders** when props are shallowly equal.\n\n\`\`\`js\nconst Row = React.memo(({ item, onSelect }) => (\n  <li onClick={() => onSelect(item.id)}>{item.name}</li>\n));\`\`\`\n\n**Common trap:** If the parent passes a new object or function reference on every render, memo never helps — combine with useMemo / useCallback for the props.\n\n**Don't over-memo:** Components that always receive new props anyway gain nothing. Measure first.`,
          visual: 'react-memo',
        },
        {
          type: 'content',
          title: 'Code Splitting & Lazy',
          body: `Ship only the code the user needs right now.\n\n\`\`\`js\nconst Settings = lazy(() => import('./Settings'));\n\n<Suspense fallback={<Spinner />}>\n  <Settings />\n</Suspense>\`\`\`\n\n**Route-level splitting** is the highest-impact starting point.\n\n**Prefetch on hover** (before click):\n\`\`\`js\nonMouseEnter={() => import('./Settings')}\`\`\`\n\n**Named chunk hints:**\n\`\`\`js\nimport(/* webpackChunkName: "settings" */ './Settings')\`\`\``,
          visual: 'code-split',
        },
        {
          type: 'content',
          title: 'Avoiding Common Pitfalls',
          body: `**Inline object/array props** — new reference every render:\n\`\`\`js\n// Bad\n<Chart style={{ color: 'red' }} />\n// Good: extract constant or useMemo\`\`\`\n\n**Inline function props** — defeats React.memo:\n\`\`\`js\n// Bad\n<Button onClick={() => save(id)} />\n// Good: useCallback\`\`\`\n\n**Context value as literal object:** always memoize\n\n**Long lists:** use TanStack Virtual or react-window — never render 10,000 DOM nodes`,
          visual: 'perf-pitfalls',
        },
        {
          type: 'content',
          title: 'Profiling React Apps',
          body: `**React DevTools Profiler:**\n- Record a session → see which components rendered, how long, and **why**\n- "Highlight updates" shows re-renders in real time\n\n**Why Did You Render** (library): logs unnecessary re-renders to the console\n\n**Chrome Performance tab:** flame charts for JS execution, layout, and paint\n\n**Rule:** Measure first, then optimize. Speculative memoization adds cognitive overhead without proven benefit.`,
          visual: 'profiling',
        },
      ],
      quiz: [
        {
          question: 'React.memo does a ___ comparison of props by default:',
          options: ['Deep recursive', 'Shallow (reference for objects)', 'Strict identity only', 'No comparison — always skips render'],
          correct: 1,
          explanation: 'React.memo does a shallow comparison. Primitive values are compared by value; objects and functions by reference.',
        },
        {
          question: 'Passing an inline arrow function as a prop to a React.memo child:',
          options: [
            'Is fine — React.memo handles it',
            'Creates a new function reference every render, defeating memoization',
            'Causes a runtime error',
            'Only matters if the child uses useCallback',
          ],
          correct: 1,
          explanation: "Every render creates a new arrow function object. React.memo sees a new prop reference and re-renders the child.",
        },
      ],
    },
    {
      id: 'react-patterns',
      title: 'Patterns & Architecture',
      icon: '🧩',
      vCoins: 50,
      lessons: [
        {
          type: 'content',
          title: 'Composition over Inheritance',
          body: `React strongly favors **composition**. The \`children\` prop is the basic primitive:\n\n\`\`\`js\n<Card>\n  <CardHeader>Title</CardHeader>\n  <CardBody>Content</CardBody>\n</Card>\`\`\`\n\n**Render props** — pass rendering control as a prop:\n\`\`\`js\n<Mouse render={pos => <Circle x={pos.x} y={pos.y} />} />\`\`\`\n\nCustom hooks have largely superseded render props for logic sharing, but the pattern still appears in headless component libraries.`,
          visual: 'composition',
        },
        {
          type: 'content',
          title: 'Compound Components',
          body: `Compound components share implicit state through context, giving callers control over structure while hiding internal mechanics.\n\n\`\`\`js\n<Tabs defaultTab="a">\n  <Tabs.List>\n    <Tabs.Tab value="a">Apple</Tabs.Tab>\n    <Tabs.Tab value="b">Banana</Tabs.Tab>\n  </Tabs.List>\n  <Tabs.Panel value="a">Apple content</Tabs.Panel>\n</Tabs>\`\`\`\n\n\`<Tabs>\` holds state; \`<Tabs.Tab>\` and \`<Tabs.Panel>\` consume it via context. Used extensively in Radix UI, Headless UI, Reach UI.`,
          visual: 'compound',
        },
        {
          type: 'content',
          title: 'Error Boundaries',
          body: `Error boundaries **catch synchronous rendering errors** in the component tree and display a fallback UI instead of a blank screen.\n\nThey must be class components (no hook equivalent exists yet):\n\n\`\`\`js\nclass ErrorBoundary extends Component {\n  state = { hasError: false };\n  static getDerivedStateFromError() { return { hasError: true }; }\n  componentDidCatch(err, info) { log(err, info); }\n  render() {\n    return this.state.hasError\n      ? <ErrorFallback />\n      : this.props.children;\n  }\n}\`\`\`\n\n**Do NOT catch:** async errors, event handler errors, server-side errors.`,
          visual: 'error-boundary',
        },
        {
          type: 'content',
          title: 'React Server Components',
          body: `React Server Components (RSC) run **on the server only** — zero JS is shipped to the client for them.\n\n**Benefits:**\n- Direct database / filesystem / secrets access\n- No hydration cost\n- Automatic tree-shaking of server-only dependencies\n\n**Rules:**\n- No state, effects, or browser APIs\n- Can be \`async\`: \`const data = await db.query();\`\n- Mark interactive subtrees with \`'use client'\`\n\n**Mental model:** Server = data-fetching shell; Client = interactive islands inside it.`,
          visual: 'rsc',
        },
      ],
      quiz: [
        {
          question: 'Compound components share implicit state between parent and children via:',
          options: ['Prop drilling through every child', 'A global Zustand store', 'React Context internal to the component family', 'Event emitters on the DOM'],
          correct: 2,
          explanation: 'Compound components use a scoped Context so child components can access parent state without explicit prop threading.',
        },
        {
          question: 'Error boundaries do NOT catch errors thrown in:',
          options: ['The render method of a child class component', 'getDerivedStateFromProps', 'An async function called from an event handler', 'A child component constructor'],
          correct: 2,
          explanation: 'Error boundaries only intercept synchronous rendering errors. Async and event-handler errors require try/catch or window.onerror.',
        },
        {
          question: 'A React Server Component sends ___ to the browser:',
          options: ['Its full source code + hydration bundle', 'Serialized output (HTML / RSC wire format) — no component JS', 'JSON props only', 'A Web Worker script'],
          correct: 1,
          explanation: 'RSCs render on the server. The component code never reaches the client — only the rendered output travels over the wire.',
        },
      ],
    },
  ],
};

// ── 2. JavaScript Core ────────────────────────────────────────────
const JS_CORE = {
  id: 'js-core',
  title: 'JavaScript Core',
  subtitle: 'The fundamentals staff engineers get tested on',
  description:
    "React knowledge without JS depth is a red flag at staff level. Closures, the event loop, this-binding, async, and prototypes — the questions that probe how well you really know the language.",
  accent: '#f7df1e',
  accentRgb: '247,223,30',
  icon: '🟨',
  totalVCoins: 175,
  modules: [
    {
      id: 'event-loop',
      title: 'The Event Loop',
      icon: '🔁',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Call Stack, Heap, Queue',
          body: `JavaScript is **single-threaded** — one call stack, one thing at a time.\n\n- **Call stack:** where function calls execute (LIFO)\n- **Heap:** where objects live in memory\n- **Task queue (macrotask):** setTimeout, setInterval, I/O callbacks\n- **Microtask queue:** Promise callbacks, queueMicrotask, MutationObserver\n\nThe event loop checks: if the call stack is empty, drain all microtasks, then take one macrotask.`,
          visual: 'event-loop',
        },
        {
          type: 'content',
          title: 'Microtasks vs Macrotasks',
          body: `**Order of execution:**\n1. Current synchronous code completes\n2. All microtasks drain (Promises, queueMicrotask)\n3. One macrotask executes (setTimeout callback, etc.)\n4. All microtasks drain again\n5. Next macrotask...\n\n\`\`\`js\nconsole.log('1');\nsetTimeout(() => console.log('4'), 0);\nPromise.resolve().then(() => console.log('2'));\nconsole.log('3');\n// Output: 1, 3, 2, 4\`\`\`\n\nThis is a classic interview question — know why '2' comes before '4'.`,
          visual: 'micro-macro',
        },
        {
          type: 'content',
          title: 'Why This Matters for UI',
          body: `Long synchronous tasks **block the event loop** — the browser cannot repaint or handle input until the stack clears.\n\n**Symptoms:** janky scrolling, unresponsive clicks, "frozen" UI.\n\n**Solutions:**\n- Break work into chunks with \`setTimeout(fn, 0)\` or \`scheduler.postTask\`\n- Use Web Workers for CPU-heavy work (no DOM access)\n- React's concurrent mode uses Fiber to yield between chunks of render work\n\n**Rule of thumb:** anything over 50ms on the main thread is a Long Task.`,
          visual: 'long-task',
        },
      ],
      quiz: [
        {
          question: 'Given: setTimeout(fn, 0) and Promise.resolve().then(fn2), which executes first?',
          options: ['setTimeout callback — it was registered first', 'Promise .then — microtasks drain before macrotasks', 'They run concurrently', 'Depends on the JavaScript engine'],
          correct: 1,
          explanation: 'Microtasks (Promise callbacks) always drain before the next macrotask (setTimeout), regardless of registration order.',
        },
        {
          question: 'The event loop picks up the next macrotask only when:',
          options: ['1 ms has passed', 'The call stack AND microtask queue are both empty', 'The browser has repainted', 'A user event fires'],
          correct: 1,
          explanation: "The event loop won't move to the next macrotask until the call stack is clear and all queued microtasks have run.",
        },
      ],
    },
    {
      id: 'closures-scope',
      title: 'Closures & Scope',
      icon: '🔒',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Lexical Scope',
          body: `JavaScript uses **lexical (static) scope** — a function's scope is determined by where it is **written**, not where it is called.\n\n\`\`\`js\nconst x = 'outer';\nfunction inner() {\n  console.log(x); // 'outer' — always, regardless of call site\n}\`\`\`\n\n**Scope chain:** when a variable is accessed, JS walks up the chain of enclosing scopes until it finds it or hits the global scope.`,
          visual: 'lexical-scope',
        },
        {
          type: 'content',
          title: 'What Is a Closure',
          body: `A **closure** is a function that remembers the variables from its enclosing scope, even after that scope has returned.\n\n\`\`\`js\nfunction makeCounter() {\n  let count = 0;\n  return () => ++count; // closes over count\n}\nconst inc = makeCounter();\ninc(); // 1\ninc(); // 2 — count persists\`\`\`\n\n**Practical uses:** data privacy, memoization, event handlers, React hooks (useState internals use closures).`,
          visual: 'closure-vis',
        },
        {
          type: 'content',
          title: 'Classic Closure Gotcha',
          body: `The loop-and-var trap:\n\n\`\`\`js\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}\n// Prints: 3, 3, 3 — all callbacks share the same i\`\`\`\n\n**Fix 1 — use let** (block-scoped, new binding per iteration):\n\`\`\`js\nfor (let i = 0; i < 3; i++) { ... } // 0, 1, 2\`\`\`\n\n**Fix 2 — IIFE:**\n\`\`\`js\nfor (var i = 0; i < 3; i++) {\n  ((j) => setTimeout(() => console.log(j), 0))(i);\n}\`\`\``,
          visual: 'closure-trap',
        },
      ],
      quiz: [
        {
          question: 'A closure is:',
          options: [
            'A function with no return value',
            'A function that captures variables from its enclosing scope',
            'A function declared inside a class',
            'A function with default parameters',
          ],
          correct: 1,
          explanation: "A closure is a function bundled with its surrounding lexical environment — it 'remembers' the variables in scope when it was defined.",
        },
        {
          question: 'In the classic var-in-loop setTimeout bug, why do all callbacks print the same value?',
          options: [
            'setTimeout is broken in loops',
            'All closures reference the same var binding, which is 3 by the time they execute',
            'console.log is asynchronous',
            'var hoists to a different scope than expected',
          ],
          correct: 1,
          explanation: 'var is function-scoped — one binding shared by all iterations. By the time setTimeout fires, the loop has finished and i === 3.',
        },
      ],
    },
    {
      id: 'this-prototypes',
      title: '`this` & Prototypes',
      icon: '🔗',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'How `this` Is Determined',
          body: `\`this\` is **dynamic** — determined by how a function is called, not where it is defined.\n\n| Call form | this value |\n|-----------|------------|\n| \`obj.method()\` | obj |\n| \`fn()\` (strict mode) | undefined |\n| \`fn()\` (sloppy) | globalThis |\n| \`new Fn()\` | new instance |\n| \`fn.call(ctx)\` | ctx |\n| Arrow function | inherited from enclosing scope |\n\nArrow functions do **not** have their own \`this\` — they close over the enclosing \`this\`. That is why React class method event handlers need \`.bind(this)\` or arrow syntax.`,
          visual: 'this-rules',
        },
        {
          type: 'content',
          title: 'Prototypal Inheritance',
          body: `Every JavaScript object has an internal \`[[Prototype]]\` link. When you access a property, JS walks the **prototype chain** until it finds it or reaches null.\n\n\`\`\`js\nconst animal = { speak() { return 'sound'; } };\nconst dog = Object.create(animal);\ndog.speak(); // found on animal via prototype chain\`\`\`\n\n**class syntax** is syntactic sugar over prototype chains:\n\`\`\`js\nclass Dog extends Animal { ... }\n// Dog.prototype.__proto__ === Animal.prototype\`\`\`\n\nKnow both forms — interviewers probe for the underlying model.`,
          visual: 'prototype-chain',
        },
        {
          type: 'content',
          title: 'call, apply, bind',
          body: `Three ways to explicitly set \`this\`:\n\n\`\`\`js\nfn.call(ctx, arg1, arg2)   // invoke immediately with ctx\nfn.apply(ctx, [arg1, arg2]) // invoke immediately, args as array\nconst bound = fn.bind(ctx)  // return a new permanently-bound fn\`\`\`\n\n**Classic use:** borrowing methods:\n\`\`\`js\nArray.prototype.slice.call(arguments) // converts Arguments to Array\`\`\`\n\n**bind in class constructors:**\n\`\`\`js\nthis.handleClick = this.handleClick.bind(this);\`\`\`\nor use class field arrow syntax (auto-binds).`,
          visual: 'call-apply-bind',
        },
      ],
      quiz: [
        {
          question: 'Arrow functions determine `this` based on:',
          options: [
            'The object they are assigned to',
            'How they are invoked',
            'The enclosing lexical scope when they were defined',
            'The global object always',
          ],
          correct: 2,
          explanation: 'Arrow functions have no own this. They capture this from the surrounding lexical context at definition time.',
        },
        {
          question: 'Object.create(proto) creates an object whose [[Prototype]] is:',
          options: ['null', 'Object.prototype', 'proto', 'A copy of proto'],
          correct: 2,
          explanation: 'Object.create(proto) sets the new object\'s prototype to proto — enabling delegation up the chain.',
        },
      ],
    },
    {
      id: 'async-js',
      title: 'Async JavaScript',
      icon: '⏳',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Promises',
          body: `A Promise represents a future value — pending, fulfilled, or rejected.\n\n\`\`\`js\nfetch('/api/data')\n  .then(res => res.json())\n  .then(data => render(data))\n  .catch(err => handleError(err))\n  .finally(() => setLoading(false));\`\`\`\n\n**Key combinators:**\n- \`Promise.all([...])\` — all succeed or fail fast\n- \`Promise.allSettled([...])\` — wait for all, collect results and errors\n- \`Promise.race([...])\` — first to settle wins\n- \`Promise.any([...])\` — first to fulfill wins`,
          visual: 'promise-vis',
        },
        {
          type: 'content',
          title: 'async / await',
          body: `async/await is syntactic sugar over Promises — the same microtask queue, same semantics.\n\n\`\`\`js\nasync function loadUser(id) {\n  try {\n    const res = await fetch(\`/api/users/\${id}\`);\n    if (!res.ok) throw new Error(res.statusText);\n    return await res.json();\n  } catch (err) {\n    handleError(err);\n  }\n}\`\`\`\n\n**Parallel requests — don't serialize needlessly:**\n\`\`\`js\n// Bad: sequential, 2x slower\nconst a = await fetchA();\nconst b = await fetchB();\n// Good: concurrent\nconst [a, b] = await Promise.all([fetchA(), fetchB()]);\`\`\``,
          visual: 'async-await',
        },
        {
          type: 'content',
          title: 'Error Handling Patterns',
          body: `**Unhandled Promise rejections** crash Node and log warnings in browsers.\n\nAlways attach a catch or use try/catch with await.\n\n**Pattern: result tuple (Go-style):**\n\`\`\`js\nasync function safe(promise) {\n  try { return [null, await promise]; }\n  catch (e) { return [e, null]; }\n}\nconst [err, data] = await safe(fetchUser(id));\nif (err) return handleError(err);\`\`\`\n\nThis avoids deeply nested try/catch blocks in complex async flows.`,
          visual: 'async-error',
        },
      ],
      quiz: [
        {
          question: 'Promise.all vs Promise.allSettled — the key difference is:',
          options: [
            'all is faster; allSettled is slower',
            'all rejects immediately if any promise rejects; allSettled waits for all to settle',
            'allSettled only works with async/await',
            'all returns an array; allSettled returns an object',
          ],
          correct: 1,
          explanation: 'Promise.all "fails fast" on the first rejection. allSettled waits for everything and gives you the status of each.',
        },
        {
          question: 'Two independent fetches written as sequential awaits instead of Promise.all will:',
          options: [
            'Run in parallel — await is smart enough',
            'Run sequentially, taking roughly double the time',
            'Throw a race condition error',
            'Make no difference in a single-threaded runtime',
          ],
          correct: 1,
          explanation: 'Each await pauses execution until that promise resolves. Without Promise.all, the second fetch does not start until the first completes.',
        },
      ],
    },
    {
      id: 'modern-js',
      title: 'Modern JS Features',
      icon: '🆕',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Destructuring & Spread',
          body: `**Destructuring** unpacks values from arrays or objects:\n\`\`\`js\nconst { name, age = 25 } = user;   // with default\nconst [first, ...rest] = items;    // array + rest\`\`\`\n\n**Spread** copies enumerable own properties:\n\`\`\`js\nconst updated = { ...user, role: 'admin' }; // shallow clone + override\nconst merged = [...a, ...b];                // array concat\`\`\`\n\n**Gotcha:** spread is a shallow copy — nested objects are still shared references.`,
          visual: 'destructure',
        },
        {
          type: 'content',
          title: 'Optional Chaining & Nullish Coalescing',
          body: `**Optional chaining (\`?.\`)** short-circuits to \`undefined\` instead of throwing when the left side is null/undefined:\n\`\`\`js\nconst city = user?.address?.city;         // safe deep access\nconst fn = obj?.method?.();               // safe method call\`\`\`\n\n**Nullish coalescing (\`??\`)** falls back only on \`null\` or \`undefined\` (not 0 or ''):\n\`\`\`js\nconst port = config.port ?? 3000;  // 0 is valid here\nconst name = user.name || 'Guest'; // 0 or '' would also trigger fallback\`\`\`\n\nKnow when to prefer \`??\` over \`||\`.`,
          visual: 'nullish',
        },
        {
          type: 'content',
          title: 'Generators & Iterators',
          body: `Generators produce values lazily — useful for infinite sequences and custom iteration.\n\n\`\`\`js\nfunction* range(start, end) {\n  for (let i = start; i <= end; i++) yield i;\n}\n[...range(1, 5)] // [1, 2, 3, 4, 5]\`\`\`\n\nAny object implementing the **iterator protocol** (\`[Symbol.iterator]\`) is iterable:\n\`\`\`js\nfor (const x of myIterable) { ... }\`\`\`\n\n**At staff level:** understand how async generators power streaming responses and React Suspense data fetching.`,
          visual: 'generators',
        },
      ],
      quiz: [
        {
          question: 'The nullish coalescing operator (??) returns the right side when the left is:',
          options: ['Falsy (0, "", false, null, undefined)', 'Only null or undefined', 'Only undefined', 'Any falsy value except 0'],
          correct: 1,
          explanation: '?? only triggers on null and undefined — unlike ||, which triggers on any falsy value including 0 and empty string.',
        },
        {
          question: 'Spreading an object ({ ...obj }) creates:',
          options: ['A deep clone with no shared references', 'A shallow clone — nested objects are still shared', 'A frozen immutable copy', 'A proxy that forwards all property access'],
          correct: 1,
          explanation: 'Spread copies own enumerable properties one level deep. Nested objects remain the same references.',
        },
      ],
    },
  ],
};

// ── 3. CSS & Layout ───────────────────────────────────────────────
const CSS_LAYOUT = {
  id: 'css-layout',
  title: 'CSS & Layout',
  subtitle: 'Box model, Flexbox, Grid, and modern CSS',
  description:
    'The CSS depth that frontend interviews actually test — specificity, stacking contexts, Flexbox alignment, Grid areas, responsive design, and CSS features that shipped in the last few years.',
  accent: '#264de4',
  accentRgb: '38,77,228',
  icon: '🎨',
  totalVCoins: 160,
  modules: [
    {
      id: 'box-model-cascade',
      title: 'Box Model & Cascade',
      icon: '📦',
      vCoins: 30,
      lessons: [
        {
          type: 'content',
          title: 'The Box Model',
          body: `Every element is a rectangular box with four layers:\n\n**content → padding → border → margin**\n\n**box-sizing:**\n- \`content-box\` (default): width/height apply to content only\n- \`border-box\`: width/height include padding and border — almost universally set via \`* { box-sizing: border-box }\`\n\n**Margin collapse:** vertical margins between adjacent siblings collapse to the larger value. Does not happen with Flexbox or Grid children.`,
          visual: 'box-model',
        },
        {
          type: 'content',
          title: 'Specificity',
          body: `Specificity determines which rule wins when multiple declarations target the same element.\n\n**Specificity weight (highest → lowest):**\n1. \`!important\` (avoid)\n2. Inline styles (\`style=""\`) — 1,0,0,0\n3. ID selectors (\`#id\`) — 0,1,0,0\n4. Class / attribute / pseudo-class (\`.class\`, \`[attr]\`, \`:hover\`) — 0,0,1,0\n5. Element / pseudo-element (\`div\`, \`::before\`) — 0,0,0,1\n\nWhen specificity ties, **source order** (last declaration) wins.`,
          visual: 'specificity',
        },
        {
          type: 'content',
          title: 'Stacking Contexts',
          body: `A **stacking context** is an independent z-index universe. Elements inside it are painted as a unit relative to their parent context.\n\n**A new stacking context is created by:**\n- \`position\` (non-static) + \`z-index\` not auto\n- \`opacity < 1\`\n- \`transform\`, \`filter\`, \`will-change\`, \`isolation: isolate\`\n\n**Key interview trap:** a \`z-index: 9999\` inside a stacking context with \`z-index: 1\` will always render below elements in a sibling context with \`z-index: 2\`.`,
          visual: 'stacking',
        },
      ],
      quiz: [
        {
          question: 'With box-sizing: border-box, a 200px-wide element with 20px padding has:',
          options: ['200px content + 40px padding = 240px total width', '200px total width (content shrinks to 160px)', '200px content only — padding is outside', 'It depends on the margin'],
          correct: 1,
          explanation: 'border-box makes width include padding and border, so content area = 200 - 40 = 160px. Total rendered width stays 200px.',
        },
        {
          question: 'A child with z-index: 999 inside a parent with z-index: 1 will:',
          options: [
            'Always appear on top of everything',
            'Appear above z-index: 999 siblings outside the parent if the parent z-index is higher',
            'Only stack above siblings within the same stacking context as its parent',
            'Ignore z-index completely',
          ],
          correct: 2,
          explanation: "z-index is relative to the stacking context. A child can't escape its parent's stacking context, no matter how high its own z-index.",
        },
      ],
    },
    {
      id: 'flexbox',
      title: 'Flexbox',
      icon: '↔️',
      vCoins: 30,
      lessons: [
        {
          type: 'content',
          title: 'Main Axis & Cross Axis',
          body: `Flexbox operates on two axes:\n- **Main axis:** direction of flex items (set by \`flex-direction\`)\n- **Cross axis:** perpendicular to main\n\n**Key properties on the container:**\n- \`justify-content\` — aligns items along the **main axis**\n- \`align-items\` — aligns items along the **cross axis**\n- \`align-content\` — aligns **rows** (only meaningful with wrapping)\n- \`gap\` — spacing between items (replaces margin hacks)\n\n**Common trap:** \`justify-items\` does not exist in Flexbox (it's a Grid property).`,
          visual: 'flex-axes',
        },
        {
          type: 'content',
          title: 'flex-grow, flex-shrink, flex-basis',
          body: `The \`flex\` shorthand sets all three: \`flex: grow shrink basis\`\n\n- **flex-basis:** the starting size before free space is distributed\n- **flex-grow:** how much to expand to fill extra space (proportion)\n- **flex-shrink:** how much to contract when space is tight\n\n**Common recipes:**\n\`\`\`css\nflex: 1         /* grow to fill, shrink if needed, basis 0 */\nflex: auto      /* grow and shrink, basis = content size */\nflex: none      /* rigid — no grow or shrink */\`\`\`\n\n\`flex: 1\` on all siblings → equal width columns.`,
          visual: 'flex-props',
        },
        {
          type: 'content',
          title: 'Common Flexbox Patterns',
          body: `**Centering (the classic):**\n\`\`\`css\n.parent {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n}\`\`\`\n\n**Sticky footer:**\n\`\`\`css\nbody { display: flex; flex-direction: column; min-height: 100vh; }\nmain { flex: 1; }\n\`\`\`\n\n**Auto margin trick:** \`margin-left: auto\` on a flex child pushes it to the far end of the main axis — great for nav "spacer" patterns.`,
          visual: 'flex-patterns',
        },
      ],
      quiz: [
        {
          question: '`justify-content` in Flexbox controls alignment on:',
          options: ['The cross axis', 'The main axis', 'Both axes simultaneously', 'Only the inline axis'],
          correct: 1,
          explanation: 'justify-content distributes space along the main axis (row direction by default). align-items handles the cross axis.',
        },
        {
          question: '`flex: 1` is equivalent to:',
          options: ['flex: 1 1 auto', 'flex: 1 1 0%', 'flex: 1 0 auto', 'flex: 0 1 auto'],
          correct: 1,
          explanation: 'flex: 1 expands to flex: 1 1 0%. flex-basis of 0 means items start from nothing and grow proportionally from there.',
        },
      ],
    },
    {
      id: 'css-grid',
      title: 'CSS Grid',
      icon: '🔲',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Tracks, Lines & Areas',
          body: `Grid defines **rows** and **columns** (tracks). Items are placed on numbered **grid lines** or named **areas**.\n\n\`\`\`css\n.grid {\n  display: grid;\n  grid-template-columns: 1fr 2fr 1fr;\n  grid-template-rows: auto 1fr auto;\n  gap: 16px;\n}\`\`\`\n\n**fr unit:** fraction of available space after fixed tracks are allocated.\n\n**Named areas:**\n\`\`\`css\ngrid-template-areas:\n  "header header"\n  "sidebar main"\n  "footer footer";\n.header { grid-area: header; }\`\`\``,
          visual: 'grid-tracks',
        },
        {
          type: 'content',
          title: 'auto-fill vs auto-fit',
          body: `Both create as many columns as fit the container. They differ on what happens with empty space:\n\n**auto-fill:** empty tracks remain — the grid has as many columns as physically fit\n\`\`\`css\ngrid-template-columns: repeat(auto-fill, minmax(200px, 1fr));\`\`\`\n\n**auto-fit:** empty tracks collapse — existing items stretch to fill the row\n\n**Rule of thumb:** auto-fit for card layouts where items should expand. auto-fill when you need a fixed grid structure regardless of item count.`,
          visual: 'grid-repeat',
        },
        {
          type: 'content',
          title: 'Placement & Spanning',
          body: `Items can explicitly span multiple tracks:\n\n\`\`\`css\n.featured {\n  grid-column: 1 / 3;   /* from line 1 to line 3 (spans 2 cols) */\n  grid-row: span 2;      /* spans 2 rows from auto-placed position */\n}\`\`\`\n\n**dense auto-placement:**\n\`\`\`css\ngrid-auto-flow: dense; /* fill in gaps left by large items */\`\`\`\n\n**Grid vs Flexbox:** Grid = two-dimensional layout. Flexbox = one-dimensional (row OR column). Use Grid when both axes matter.`,
          visual: 'grid-placement',
        },
      ],
      quiz: [
        {
          question: 'The `fr` unit in grid-template-columns represents:',
          options: ['Fixed pixel fraction of the viewport', 'A fraction of the remaining space after non-flexible tracks are resolved', 'A percentage of the parent element', 'Font-relative units'],
          correct: 1,
          explanation: 'fr stands for "fraction". 1fr takes 1 equal share of the leftover space after fixed or auto tracks are sized.',
        },
        {
          question: 'When should you reach for Grid over Flexbox?',
          options: [
            'Always — Grid is strictly more powerful',
            'When layout is two-dimensional (rows AND columns must align)',
            'Only for print layouts',
            'When you need more than 3 columns',
          ],
          correct: 1,
          explanation: 'Grid excels at two-dimensional layouts where both axes need control. Flexbox is ideal for one-dimensional flows.',
        },
      ],
    },
    {
      id: 'responsive-modern-css',
      title: 'Responsive & Modern CSS',
      icon: '📱',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Responsive Design Principles',
          body: `**Mobile-first:** start with the mobile layout, enhance with min-width media queries.\n\n\`\`\`css\n/* mobile default */\n.card { flex-direction: column; }\n/* tablet+ */\n@media (min-width: 768px) { .card { flex-direction: row; } }\`\`\`\n\n**Fluid sizing with clamp():**\n\`\`\`css\nfont-size: clamp(1rem, 2.5vw, 2rem); /* min, preferred, max */\`\`\`\n\n**Logical properties** (for RTL support):\n\`margin-inline-start\` instead of \`margin-left\``,
          visual: 'responsive',
        },
        {
          type: 'content',
          title: 'CSS Custom Properties',
          body: `Custom properties (CSS variables) are inherited and cascade like any property.\n\n\`\`\`css\n:root { --color-accent: #7c3aed; }\n.button { background: var(--color-accent); }\n\n/* Scoped override */\n.dark-theme { --color-accent: #a78bfa; }\`\`\`\n\n**Dynamic theming:** change \`--color-accent\` on the root via JS for instant theme switching without class-name juggling.\n\n**vs Sass variables:** custom properties are live at runtime; Sass variables are compile-time constants.`,
          visual: 'css-vars',
        },
        {
          type: 'content',
          title: 'Container Queries',
          body: `Container queries let components respond to their **own** container size rather than the viewport.\n\n\`\`\`css\n.card-wrapper { container-type: inline-size; }\n\n@container (min-width: 400px) {\n  .card { flex-direction: row; }\n}\`\`\`\n\n**Why it matters:** A sidebar card and a main-area card are the same component. With viewport media queries, you can't know which context they're in. Container queries solve this.\n\nNow baseline-supported in all modern browsers.`,
          visual: 'container-queries',
        },
      ],
      quiz: [
        {
          question: 'clamp(1rem, 4vw, 2rem) will produce:',
          options: [
            'Always 4vw regardless of viewport',
            'A value between 1rem and 2rem that scales with viewport width',
            'Always 1rem on mobile and 2rem on desktop',
            'A value in pixels only',
          ],
          correct: 1,
          explanation: 'clamp returns the middle value (4vw), clamped between min (1rem) and max (2rem). It produces a fluid value bounded by limits.',
        },
        {
          question: 'CSS custom properties differ from Sass variables because they:',
          options: [
            'Use a different syntax only',
            'Are scoped to the component by default',
            'Are live at runtime and can be changed by JS or inherited by descendants',
            'Cannot be used in calculations',
          ],
          correct: 2,
          explanation: 'CSS custom properties are part of the cascade — they inherit, can be overridden by descendant scopes, and can be read/written by JavaScript at runtime.',
        },
      ],
    },
  ],
};

// ── 4. Accessibility ──────────────────────────────────────────────
const ACCESSIBILITY = {
  id: 'accessibility',
  title: 'Accessibility (a11y)',
  subtitle: 'WCAG, ARIA, keyboard nav, and testing',
  description:
    'Accessibility is a staff-level expectation, not a nice-to-have. Learn WCAG principles, semantic HTML, ARIA roles, keyboard navigation patterns, and how to audit for real issues.',
  accent: '#059669',
  accentRgb: '5,150,105',
  icon: '♿',
  totalVCoins: 150,
  modules: [
    {
      id: 'wcag-principles',
      title: 'WCAG & Why It Matters',
      icon: '📋',
      vCoins: 25,
      lessons: [
        {
          type: 'content',
          title: 'The Four Principles (POUR)',
          body: `WCAG 2.x organizes requirements under four principles:\n\n- **Perceivable** — content must be presentable in ways users can perceive (text alternatives, captions, sufficient contrast)\n- **Operable** — UI must be navigable and operable (keyboard accessible, no seizure-inducing content)\n- **Understandable** — content and UI must be understandable (readable language, predictable behavior, error identification)\n- **Robust** — content must work with current and future assistive technologies\n\n**Levels:** A (minimum), AA (legal baseline in most countries), AAA (enhanced)`,
          visual: 'wcag',
        },
        {
          type: 'content',
          title: 'Legal & Business Case',
          body: `Accessibility is legally required in many jurisdictions:\n\n- **USA:** ADA + Section 508 (federal), interpreted to include websites\n- **EU:** European Accessibility Act (2025 enforcement)\n- **UK:** Equality Act 2010\n\n**Business case:**\n- ~15% of the world has some form of disability\n- Accessible sites perform better in SEO (semantic HTML, alt text)\n- Accessible UIs tend to be more usable for everyone (keyboard nav, captions, clear labels)\n\nAt staff level: know the why, not just the how.`,
          visual: 'a11y-legal',
        },
      ],
      quiz: [
        {
          question: 'The "P" in POUR (WCAG) stands for:',
          options: ['Predictable', 'Perceivable', 'Programmable', 'Page-accessible'],
          correct: 1,
          explanation: 'Perceivable means users must be able to perceive the content — via sight, sound, or touch — with appropriate alternatives provided.',
        },
        {
          question: 'WCAG Level AA is significant because:',
          options: [
            'It is the easiest level to achieve',
            'It is the legal baseline in most countries and covers the most common issues',
            'It only applies to government websites',
            'It requires AAA compliance for some criteria',
          ],
          correct: 1,
          explanation: 'AA is the practical target — it covers the most impactful requirements and is the level referenced by most accessibility laws.',
        },
      ],
    },
    {
      id: 'semantic-html',
      title: 'Semantic HTML',
      icon: '🏷️',
      vCoins: 30,
      lessons: [
        {
          type: 'content',
          title: 'Landmark Elements',
          body: `Landmark elements give pages structure that screen reader users can navigate directly:\n\n\`\`\`html\n<header>  <!-- banner landmark -->\n<nav>     <!-- navigation landmark -->\n<main>    <!-- main landmark (one per page) -->\n<aside>   <!-- complementary landmark -->\n<footer>  <!-- contentinfo landmark -->\n<section> <!-- needs aria-label to be a landmark -->\`\`\`\n\n**Heading hierarchy:** Use headings (\`h1\`–\`h6\`) to build a logical outline — don't skip levels. Screen reader users navigate by headings like a table of contents.`,
          visual: 'landmarks',
        },
        {
          type: 'content',
          title: 'Forms & Labels',
          body: `Every form control must have an accessible name.\n\n**Explicit label (preferred):**\n\`\`\`html\n<label for="email">Email address</label>\n<input id="email" type="email" />\`\`\`\n\n**aria-label (when no visible label):**\n\`\`\`html\n<input aria-label="Search" type="search" />\`\`\`\n\n**aria-describedby (for hints and errors):**\n\`\`\`html\n<input aria-describedby="email-error" />\n<span id="email-error" role="alert">Invalid email</span>\`\`\`\n\n**Never use placeholder as the only label** — it disappears on focus and has low contrast.`,
          visual: 'forms-a11y',
        },
        {
          type: 'content',
          title: 'Images & Alternative Text',
          body: `**Meaningful images:** describe the content, not the appearance:\n\`\`\`html\n<img src="chart.png" alt="Bar chart showing 40% increase in revenue Q3 2024" />\`\`\`\n\n**Decorative images:** empty alt hides them from screen readers:\n\`\`\`html\n<img src="divider.svg" alt="" />\`\`\`\n\n**SVGs:** use \`aria-label\` or \`<title>\` + \`aria-labelledby\` for meaningful SVGs; \`aria-hidden="true"\` for decorative.\n\n**Icon buttons:** always provide a text label via \`aria-label\`:\n\`\`\`html\n<button aria-label="Close dialog">✕</button>\`\`\``,
          visual: 'images-a11y',
        },
      ],
      quiz: [
        {
          question: 'Using placeholder as the only form label is problematic because:',
          options: [
            'Placeholders are not supported in all browsers',
            'Placeholders disappear on focus and often have insufficient contrast',
            'Placeholder text is not read by screen readers at all',
            'It causes form submission errors',
          ],
          correct: 1,
          explanation: "Placeholder text vanishes when the user starts typing, leaving them without context. It also commonly fails WCAG contrast requirements.",
        },
        {
          question: 'A decorative image should have:',
          options: ['No alt attribute', 'alt="decorative"', 'alt="" (empty string)', 'role="presentation" only'],
          correct: 2,
          explanation: 'alt="" explicitly marks the image as decorative so screen readers skip it entirely. Omitting alt entirely is invalid HTML.',
        },
      ],
    },
    {
      id: 'aria',
      title: 'ARIA Roles & Attributes',
      icon: '🎭',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'The First Rule of ARIA',
          body: `**"Don't use ARIA if you can use native HTML."**\n\nA \`<button>\` is keyboard focusable, has role="button", fires click on Enter/Space, and announces as a button — all for free. \`<div role="button">\` requires you to add all of that manually.\n\n**ARIA only adds semantics — it never adds behavior or styling.**\n\nWhen ARIA is appropriate: custom widgets (combobox, tree, dialog) with no native HTML equivalent.`,
          visual: 'aria-first-rule',
        },
        {
          type: 'content',
          title: 'Key ARIA Attributes',
          body: `**Naming and describing:**\n- \`aria-label\` — overrides the accessible name with a string\n- \`aria-labelledby\` — points to another element's text as the name\n- \`aria-describedby\` — provides supplementary description\n\n**State:**\n- \`aria-expanded\` — for toggles (accordion, dropdown)\n- \`aria-pressed\` — for toggle buttons\n- \`aria-selected\` — for tab panels and listboxes\n- \`aria-hidden="true"\` — hides from accessibility tree\n\n**Live regions:**\n- \`aria-live="polite"\` — announce when idle\n- \`role="alert"\` — announce immediately (implies \`aria-live="assertive"\`)`,
          visual: 'aria-attrs',
        },
        {
          type: 'content',
          title: 'Modal Dialog Pattern',
          body: `A fully accessible modal requires:\n\n1. \`role="dialog"\` + \`aria-modal="true"\`\n2. \`aria-labelledby\` pointing to the dialog title\n3. **Focus trap:** Tab/Shift+Tab must cycle within the dialog\n4. **Focus restore:** return focus to the trigger element on close\n5. **Escape key** closes the dialog\n6. Background content has \`aria-hidden="true"\` while open\n\nThis is a common interview question — interviewers test whether you know all six requirements, not just \`role="dialog"\`.`,
          visual: 'modal-a11y',
        },
      ],
      quiz: [
        {
          question: 'The first rule of ARIA is:',
          options: [
            'Always add role attributes to every element',
            'Use native HTML elements before reaching for ARIA',
            'ARIA roles override CSS styling',
            'aria-label is required on all interactive elements',
          ],
          correct: 1,
          explanation: 'Native HTML elements come with built-in accessibility semantics and behaviors. ARIA should only fill gaps for custom widgets.',
        },
        {
          question: 'Which attribute announces dynamic content changes to screen reader users?',
          options: ['aria-hidden', 'aria-live', 'aria-label', 'aria-role'],
          correct: 1,
          explanation: 'aria-live regions announce content changes without focus moving. "polite" waits for the user to be idle; "assertive" interrupts immediately.',
        },
      ],
    },
    {
      id: 'keyboard-testing',
      title: 'Keyboard Nav & Testing',
      icon: '⌨️',
      vCoins: 30,
      lessons: [
        {
          type: 'content',
          title: 'Keyboard Navigation Essentials',
          body: `**Every interactive element must be keyboard reachable and operable.**\n\n| Key | Expected behavior |\n|-----|-------------------|\n| Tab | Move to next focusable element |\n| Shift+Tab | Move backward |\n| Enter | Activate buttons, links |\n| Space | Activate buttons, toggle checkboxes |\n| Esc | Close dialogs, clear type-ahead |\n| Arrow keys | Navigate within widgets (menus, tabs, sliders) |\n\n**Focus indicator:** Must be visible. Don't remove \`:focus\` outline without providing an equally visible custom style.`,
          visual: 'keyboard-nav',
        },
        {
          type: 'content',
          title: 'Skip Links & Focus Management',
          body: `**Skip links** let keyboard users bypass repetitive navigation:\n\`\`\`html\n<a href="#main" class="skip-link">Skip to main content</a>\n...\n<main id="main">\`\`\`\nMake them visible on focus (typically hidden off-screen until :focus).\n\n**Focus management in SPAs:** On route change, move focus to the \`<h1>\` or page container so screen reader users hear the new page title.\n\n**Focus trap:** In modals and drawers, prevent Tab from leaving the dialog while it's open. Libraries like \`focus-trap-react\` handle this correctly.`,
          visual: 'focus-management',
        },
        {
          type: 'content',
          title: 'Auditing for Accessibility',
          body: `**Automated tools (catch ~30–40% of issues):**\n- **axe DevTools** browser extension — most accurate auto-checker\n- **Lighthouse** — includes accessibility audit\n- **eslint-plugin-jsx-a11y** — catches issues at write time\n\n**Manual testing:**\n- Keyboard-only navigation through the page\n- Screen reader testing: NVDA+Chrome (Windows), VoiceOver+Safari (Mac/iOS), TalkBack (Android)\n- Zoom to 200% and 400% — content must reflow, not truncate\n- Disable CSS — page must still be structured and logical`,
          visual: 'a11y-testing',
        },
      ],
      quiz: [
        {
          question: 'Removing the CSS :focus outline without a replacement:',
          options: [
            'Is fine if the site uses mouse-only controls',
            'Breaks keyboard navigation by hiding which element has focus',
            'Is recommended for a cleaner visual design',
            'Only affects touch screen users',
          ],
          correct: 1,
          explanation: 'The focus ring is the visual indicator for keyboard users. Removing it without an alternative makes the site impossible to navigate via keyboard.',
        },
        {
          question: 'Automated accessibility tools like axe can catch approximately:',
          options: ['100% of WCAG failures', '70–80% of common issues', '30–40% of issues — manual testing is essential', '10% — they are mostly for developers'],
          correct: 2,
          explanation: 'Automated tools catch structural issues well but miss context-dependent problems (e.g., whether alt text is meaningful, reading order, focus management).',
        },
      ],
    },
  ],
};

// ── 5. Performance & Web Vitals ───────────────────────────────────
const WEB_PERFORMANCE = {
  id: 'web-performance',
  title: 'Performance & Web Vitals',
  subtitle: 'Core Web Vitals, bundles, caching, rendering',
  description:
    'Performance is a top-tier staff question. Core Web Vitals, JavaScript bundle strategies, network/caching fundamentals, main-thread rendering, and how to measure what actually matters.',
  accent: '#dc2626',
  accentRgb: '220,38,38',
  icon: '🚀',
  totalVCoins: 190,
  modules: [
    {
      id: 'core-web-vitals',
      title: 'Core Web Vitals',
      icon: '📊',
      vCoins: 40,
      lessons: [
        {
          type: 'content',
          title: 'LCP — Largest Contentful Paint',
          body: `**Measures:** How quickly the largest visible content element loads (hero image, heading text).\n\n**Good:** ≤ 2.5s | **Needs improvement:** ≤ 4s | **Poor:** > 4s\n\n**Common culprits:**\n- Slow server response (TTFB)\n- Render-blocking resources (CSS / JS)\n- Large, unoptimized images\n- Client-side rendered content (no HTML at TTFB)\n\n**Fixes:** Preload the LCP element, serve images in WebP/AVIF, use a CDN, implement SSR/SSG.`,
          visual: 'lcp',
        },
        {
          type: 'content',
          title: 'INP — Interaction to Next Paint',
          body: `**Measures:** Responsiveness to user interactions (replaced FID in 2024). Captures the worst interaction during the page lifetime.\n\n**Good:** ≤ 200ms | **Needs improvement:** ≤ 500ms | **Poor:** > 500ms\n\n**Common culprits:**\n- Long Tasks on the main thread (>50ms)\n- Heavy event handlers (no debouncing)\n- Layout thrashing (read then write then read DOM in a loop)\n\n**Fixes:** Break up long tasks with \`scheduler.yield()\`, defer non-critical work, debounce/throttle handlers.`,
          visual: 'inp',
        },
        {
          type: 'content',
          title: 'CLS — Cumulative Layout Shift',
          body: `**Measures:** How much page content unexpectedly shifts during load.\n\n**Good:** ≤ 0.1 | **Needs improvement:** ≤ 0.25 | **Poor:** > 0.25\n\n**Common culprits:**\n- Images and videos without explicit width/height\n- Ads, embeds, iframes injected without reserved space\n- Late-loading fonts causing text reflow\n- Inserting DOM above existing content\n\n**Fixes:** Always set \`width\` and \`height\` on images, reserve space for ads with CSS \`aspect-ratio\`, use \`font-display: optional\` or swap+preload.`,
          visual: 'cls',
        },
        {
          type: 'content',
          title: 'Measuring & Tooling',
          body: `**Lab data (simulated):**\n- **Lighthouse** — in Chrome DevTools, runs a simulated page load\n- **WebPageTest** — multi-step, multi-device, filmstrip view\n\n**Field data (real users):**\n- **CrUX (Chrome UX Report)** — p75 data from real Chrome users\n- **Google Search Console** — Core Web Vitals report per URL\n- **web-vitals JS library** — instrument your site to collect real user data\n\n**Rule:** Lab data for debugging; field data for the truth. Lab environments can't capture interaction patterns or network variance.`,
          visual: 'cwv-tools',
        },
      ],
      quiz: [
        {
          question: 'Which Core Web Vital replaced FID in March 2024?',
          options: ['TBT (Total Blocking Time)', 'INP (Interaction to Next Paint)', 'TTI (Time to Interactive)', 'FCP (First Contentful Paint)'],
          correct: 1,
          explanation: 'INP replaced FID as the responsiveness metric in CWV. FID only captured the first interaction; INP captures the worst interaction across the full session.',
        },
        {
          question: 'CLS is most commonly caused by:',
          options: [
            'Slow server response times',
            'JavaScript executing for too long',
            'Images and embeds loaded without reserved dimensions',
            'Too many CSS animations',
          ],
          correct: 2,
          explanation: 'When images load without width/height, the browser cannot reserve space. Content reflows and shifts when the image finally loads.',
        },
      ],
    },
    {
      id: 'js-perf',
      title: 'JavaScript Performance',
      icon: '📦',
      vCoins: 40,
      lessons: [
        {
          type: 'content',
          title: 'Bundle Size Strategies',
          body: `**Tree shaking:** bundlers remove unused exports at build time. Use named imports, not default object imports:\n\`\`\`js\n// Good — tree-shakeable\nimport { debounce } from 'lodash-es';\n// Bad — imports entire library\nimport _ from 'lodash';\`\`\`\n\n**Code splitting:** split by route, by feature, by user segment.\n\n**Analyze your bundle:** \`webpack-bundle-analyzer\`, \`vite-bundle-visualizer\`, \`source-map-explorer\` — identify what's large and why.`,
          visual: 'bundle-size',
        },
        {
          type: 'content',
          title: 'Script Loading Strategies',
          body: `**Script loading attributes:**\n\n\`<script src="...">\` — blocks HTML parsing\n\`<script defer src="...">\` — download in parallel, execute after HTML parsed (maintains order)\n\`<script async src="...">\` — download in parallel, execute immediately when ready (no order guarantee)\n\n**Rule:** Use \`defer\` for most scripts. \`async\` for analytics and third-party scripts that have no dependencies.\n\n**Module scripts (\`type="module"\`):** implicitly deferred.`,
          visual: 'script-loading',
        },
        {
          type: 'content',
          title: 'Long Tasks & Yielding',
          body: `A **Long Task** is any main-thread work over 50ms. It blocks input handling and frame rendering.\n\n**Strategies to break them up:**\n\n\`\`\`js\n// scheduler.yield() — cede control then resume\nasync function processLargeList(items) {\n  for (const item of items) {\n    process(item);\n    if (shouldYield()) await scheduler.yield();\n  }\n}\`\`\`\n\n**Web Workers:** offload CPU-heavy computation (sorting, parsing, crypto) to a background thread — no DOM access, but no jank either.`,
          visual: 'long-tasks',
        },
      ],
      quiz: [
        {
          question: 'Tree shaking is most effective when:',
          options: [
            'You use default exports from every module',
            'You use ES module named imports and the library ships ESM',
            'You run the code in Node.js',
            'You minify your CSS',
          ],
          correct: 1,
          explanation: 'Tree shaking relies on static analysis of ESM import/export statements. CommonJS (require) cannot be statically analyzed.',
        },
        {
          question: 'script defer vs script async — defer:',
          options: [
            'Downloads the script synchronously',
            'Executes immediately when downloaded, before HTML parsing finishes',
            'Executes after HTML is parsed, maintaining script order',
            'Converts the script to a module',
          ],
          correct: 2,
          explanation: 'defer downloads in parallel but waits for HTML parsing to complete. Multiple defer scripts execute in document order.',
        },
      ],
    },
    {
      id: 'network-caching',
      title: 'Network & Caching',
      icon: '🌐',
      vCoins: 40,
      lessons: [
        {
          type: 'content',
          title: 'HTTP Caching',
          body: `**Cache-Control header** drives browser and CDN caching:\n\n- \`max-age=31536000, immutable\` — cache forever (for hashed filenames)\n- \`no-cache\` — always revalidate (ETags), but can serve from cache if valid\n- \`no-store\` — never cache (sensitive data)\n- \`s-maxage\` — CDN cache duration (overrides max-age for shared caches)\n\n**ETag / If-None-Match:** Conditional request — server returns 304 Not Modified if unchanged (saves bandwidth, but still costs a round-trip).`,
          visual: 'http-cache',
        },
        {
          type: 'content',
          title: 'Resource Hints',
          body: `Hint the browser to fetch resources early:\n\n\`\`\`html\n<!-- Critical for next page navigation -->\n<link rel="prefetch" href="/dashboard.js">\n\n<!-- Warm up the connection (DNS + TCP + TLS) -->\n<link rel="preconnect" href="https://fonts.gstatic.com">\n\n<!-- Fetch and cache critical resources for this page -->\n<link rel="preload" as="font" href="/font.woff2" crossorigin>\`\`\`\n\n**Don't overdo preload** — preloading too many resources competes for bandwidth and can hurt LCP.`,
          visual: 'resource-hints',
        },
        {
          type: 'content',
          title: 'Service Workers',
          body: `A **Service Worker** runs in the background, intercepts network requests, and can serve from a cache offline.\n\n**Caching strategies:**\n- **Cache-first:** serve cache, update in background (fast, potentially stale)\n- **Network-first:** try network, fall back to cache (fresh, fails offline)\n- **Stale-while-revalidate:** serve cache immediately, update cache from network\n\n**Workbox** (from Google) provides production-ready implementations of these strategies with minimal boilerplate.`,
          visual: 'service-worker',
        },
      ],
      quiz: [
        {
          question: 'Cache-Control: max-age=31536000, immutable is appropriate for:',
          options: [
            'HTML files that change with each deploy',
            'API responses with user data',
            'Static assets with content-hashed filenames (e.g., app.a3f9c2.js)',
            'Images that may be updated without filename changes',
          ],
          correct: 2,
          explanation: 'immutable + long max-age is correct for content-hashed assets — the filename changes on update, so cached versions are always valid.',
        },
        {
          question: 'The stale-while-revalidate caching strategy:',
          options: [
            'Always fetches fresh data from the network first',
            'Serves cached data immediately and updates the cache in the background',
            'Only works for API calls, not static assets',
            'Requires a service worker to implement',
          ],
          correct: 1,
          explanation: 'SWR gives instant response from cache while silently fetching an update. The next request gets the fresh version.',
        },
      ],
    },
    {
      id: 'rendering-perf',
      title: 'Rendering Performance',
      icon: '🖼️',
      vCoins: 40,
      lessons: [
        {
          type: 'content',
          title: 'Browser Rendering Pipeline',
          body: `**Frame lifecycle (order matters):**\n1. **JavaScript** — run handlers and framework work\n2. **Style** — recalculate which CSS rules apply\n3. **Layout** — compute geometry (position, size)\n4. **Paint** — draw pixels (color, text, shadows)\n5. **Composite** — combine layers onto screen\n\n**Target:** render each frame in <16ms for 60fps (or <8ms for 120fps)\n\n**Skippable stages:** changing \`opacity\` or \`transform\` only triggers composite — no layout or paint. That's why GPU-animated transitions are cheap.`,
          visual: 'render-pipeline',
        },
        {
          type: 'content',
          title: 'Layout Thrashing',
          body: `**Layout thrashing** (forced synchronous layout) happens when you read layout properties after writing to the DOM — forcing the browser to recalculate layout synchronously.\n\n\`\`\`js\n// Bad — read/write alternation\nelements.forEach(el => {\n  const h = el.offsetHeight; // forces layout\n  el.style.height = h * 2 + 'px'; // triggers layout next read\n});\n\n// Good — batch reads, then writes\nconst heights = elements.map(el => el.offsetHeight); // all reads\nelements.forEach((el, i) => el.style.height = heights[i] * 2 + 'px');\`\`\`\n\nFastDOM library automates this batching.`,
          visual: 'layout-thrash',
        },
        {
          type: 'content',
          title: 'will-change & Compositing',
          body: `\`will-change: transform\` hints to the browser to promote an element to its own GPU layer before animation starts, avoiding layer creation jank mid-animation.\n\n\`\`\`css\n.animated-card {\n  will-change: transform; /* promote before animation */\n}\`\`\`\n\n**Use sparingly** — each GPU layer costs memory. Applying it to too many elements can hurt performance, not help.\n\n**contain: strict / layout / paint** — lets the browser skip style/layout recalculations beyond the element's boundary.`,
          visual: 'compositing',
        },
      ],
      quiz: [
        {
          question: 'Why is animating `transform` and `opacity` cheaper than animating `width` or `top`?',
          options: [
            'CSS transition syntax is simpler',
            'Transform/opacity changes skip layout and paint — only triggering composite',
            'The browser uses hardware acceleration only for transform',
            'There is no performance difference',
          ],
          correct: 1,
          explanation: 'Geometry properties (width, top) trigger layout → paint → composite. Transform and opacity skip to composite-only, which runs on the GPU.',
        },
        {
          question: 'Layout thrashing occurs when:',
          options: [
            'Too many elements are in the DOM',
            'CSS animations run faster than 60fps',
            'You interleave DOM reads (offsetHeight) and writes (style changes) in a loop',
            'You use var() in CSS',
          ],
          correct: 2,
          explanation: 'Reading layout properties after DOM mutations forces the browser to recalculate layout immediately (synchronous). Batch reads before writes to avoid this.',
        },
      ],
    },
  ],
};

// ── 6. SEO Fundamentals ───────────────────────────────────────────
const SEO_FUNDAMENTALS = {
  id: 'seo-fundamentals',
  title: 'SEO Fundamentals',
  subtitle: 'How search works, meta, structured data, technical SEO',
  description:
    'The SEO knowledge a staff frontend engineer needs — how crawlers work, what signals matter, technical patterns (SSR vs CSR), structured data, and how Core Web Vitals tie into ranking.',
  accent: '#ea580c',
  accentRgb: '234,88,12',
  icon: '🔍',
  totalVCoins: 130,
  modules: [
    {
      id: 'how-search-works',
      title: 'How Search Works',
      icon: '🕷️',
      vCoins: 25,
      lessons: [
        {
          type: 'content',
          title: 'Crawl → Index → Rank',
          body: `Search engines work in three phases:\n\n1. **Crawl** — Googlebot fetches pages by following links from its crawl queue. It respects \`robots.txt\` and \`noindex\`. Crawl budget matters for large sites.\n\n2. **Index** — Fetched pages are analyzed (HTML, text, links, structured data) and stored in the search index. Not all crawled pages are indexed.\n\n3. **Rank** — When a query arrives, Google ranks indexed pages by hundreds of signals (relevance, authority, page experience).`,
          visual: 'crawl-index-rank',
        },
        {
          type: 'content',
          title: 'Crawlability Basics',
          body: `**robots.txt:** machine-readable rules for crawlers:\n\`\`\`\nUser-agent: *\nDisallow: /admin/\nAllow: /\`\`\`\n\n**Sitemap:** XML file listing all important URLs — helps crawlers discover content.\n\n**Internal links:** Every important page should be reachable within a few clicks from the homepage. Orphan pages (no inbound links) may not be crawled.\n\n**Canonicalization:** Use \`<link rel="canonical" href="...">\` to tell Google which URL is authoritative when duplicate content exists (www vs non-www, query params).`,
          visual: 'crawlability',
        },
      ],
      quiz: [
        {
          question: 'Which is the correct order of how search engines process pages?',
          options: ['Index → Crawl → Rank', 'Rank → Index → Crawl', 'Crawl → Index → Rank', 'Crawl → Rank → Index'],
          correct: 2,
          explanation: 'Googlebot first crawls pages, then analyzes and indexes them, and finally ranks them for search queries.',
        },
        {
          question: 'A canonical tag tells search engines:',
          options: [
            'To block crawling of a page',
            'Which URL is the authoritative version when duplicate content exists',
            'The author of the page',
            'The publication date for freshness ranking',
          ],
          correct: 1,
          explanation: 'rel=canonical consolidates duplicate pages (e.g. with query params) to prevent split ranking signals and indexing of unwanted URLs.',
        },
      ],
    },
    {
      id: 'meta-structured-data',
      title: 'Meta Tags & Structured Data',
      icon: '🏷️',
      vCoins: 35,
      lessons: [
        {
          type: 'content',
          title: 'Essential Meta Tags',
          body: `\`\`\`html\n<title>Page Title — Brand Name</title> <!-- 50-60 chars -->\n<meta name="description" content="..."> <!-- 150-160 chars -->\n<meta name="robots" content="index, follow">\n\n<!-- Open Graph (social sharing) -->\n<meta property="og:title" content="...">\n<meta property="og:description" content="...">\n<meta property="og:image" content="https://...">\n<meta property="og:url" content="https://...">\n\n<!-- Twitter Card -->\n<meta name="twitter:card" content="summary_large_image">\`\`\`\n\n**Title tag** is the single most important on-page SEO element. Description does not directly affect ranking but drives click-through rate (CTR).`,
          visual: 'meta-tags',
        },
        {
          type: 'content',
          title: 'Structured Data (JSON-LD)',
          body: `Structured data describes your content in a format search engines understand, enabling **rich results** (stars, FAQs, breadcrumbs, events in SERPs).\n\n\`\`\`html\n<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "How CSS Grid Works",\n  "author": { "@type": "Person", "name": "Varun" },\n  "datePublished": "2024-01-15"\n}\n</script>\`\`\`\n\nCommon types: Article, Product, FAQPage, BreadcrumbList, Organization.\n\n**Validate:** Google Rich Results Test or schema.org Validator.`,
          visual: 'structured-data',
        },
        {
          type: 'content',
          title: 'Semantic HTML & SEO',
          body: `Search engines use HTML structure to understand content hierarchy.\n\n**Heading hierarchy** signals document structure:\n- One \`<h1>\` per page (the main topic)\n- \`<h2>\` for sections, \`<h3>\` for sub-sections\n\n**Content elements:** \`<article>\`, \`<section>\`, \`<main>\`, \`<aside>\` help crawlers understand content roles.\n\n**Alt text:** Enables image search indexing and describes images to crawlers.\n\n**Link text:** "Click here" is meaningless to crawlers. Descriptive anchor text like "View our pricing plans" is both accessible and SEO-friendly.`,
          visual: 'semantic-seo',
        },
      ],
      quiz: [
        {
          question: 'The meta description tag directly affects:',
          options: ['Page ranking in search results', 'Click-through rate from the SERP', 'Crawl frequency', 'Canonical URL resolution'],
          correct: 1,
          explanation: 'Google may show the meta description in the SERP snippet. It influences whether users click, but is not a direct ranking signal.',
        },
        {
          question: 'JSON-LD structured data enables:',
          options: ['Faster crawling via sitemap replacement', 'Rich results (stars, FAQs, events) in search results', 'Direct control over page ranking', 'Improved browser rendering speed'],
          correct: 1,
          explanation: 'Structured data gives Google machine-readable context about your content, making you eligible for enhanced SERP features.',
        },
      ],
    },
    {
      id: 'technical-seo',
      title: 'Technical SEO',
      icon: '⚙️',
      vCoins: 40,
      lessons: [
        {
          type: 'content',
          title: 'SSR vs CSR for SEO',
          body: `**CSR (Client-Side Rendering):** JS renders HTML in the browser. Googlebot can execute JS but:\n- Crawling is delayed (second wave rendering)\n- Social crawlers (Twitter, Slack) often don't execute JS — OG tags must be in SSR'd HTML\n- First Contentful Paint is later → worse LCP\n\n**SSR (Server-Side Rendering):** Full HTML delivered at TTFB:\n- Immediately indexable\n- Better LCP (content visible before JS loads)\n- OG tags visible to all crawlers\n\n**SSG (Static Site Generation):** Pre-rendered at build time — best of both worlds for content that doesn't change per-user.`,
          visual: 'ssr-csr-seo',
        },
        {
          type: 'content',
          title: 'Core Web Vitals as Ranking Signal',
          body: `Google's **Page Experience** ranking signal includes Core Web Vitals.\n\n**How much does it matter?** It's a tiebreaker, not a primary signal. Relevance still dominates. But for competitive queries where content quality is similar, page experience can swing rankings.\n\n**What Google measures:** field data (real user CrUX data), not lab scores. You can score 100 on Lighthouse and still have poor field CWV if real users experience slowness.\n\n**Priority:** Fix LCP first (biggest ranking impact), then CLS (visible quality signal), then INP (newest).`,
          visual: 'cwv-ranking',
        },
        {
          type: 'content',
          title: 'Core SEO Checklist',
          body: `**Technical must-haves:**\n- HTTPS (ranking signal + trust)\n- Mobile-friendly (Google mobile-first indexing)\n- Correct robots.txt and sitemap.xml\n- No crawl errors (Google Search Console)\n- Fast TTFB and good Core Web Vitals\n- No duplicate content without canonicals\n\n**On-page:**\n- Unique title and meta description per page\n- One H1 per page\n- Descriptive alt text\n- Internal linking between related pages\n- Structured data for eligible content types`,
          visual: 'seo-checklist',
        },
      ],
      quiz: [
        {
          question: 'A pure Client-Side Rendered (CSR) app may hurt SEO primarily because:',
          options: [
            'Google cannot index JavaScript at all',
            'Crawling is delayed (second wave) and social crawlers may see no content',
            'CSR sites are always slower than SSR',
            'Google penalizes React and Angular sites',
          ],
          correct: 1,
          explanation: 'Googlebot can render JS but may delay it. Social crawlers (for OG previews) often cannot. SSR ensures content is immediately available to all crawlers.',
        },
        {
          question: 'Core Web Vitals affect SEO as:',
          options: [
            'The primary ranking signal — they outweigh content relevance',
            'A tiebreaker signal — content relevance still dominates ranking',
            'Only a mobile ranking factor, not desktop',
            'A future signal — not yet used in ranking',
          ],
          correct: 1,
          explanation: 'Page Experience (including CWV) is a tiebreaker. A slow but highly relevant page can still outrank a fast but low-quality one.',
        },
      ],
    },
  ],
};

export const FRONTEND_INTERVIEW_COURSES = [
  REACT_DEEP_DIVE,
  JS_CORE,
  CSS_LAYOUT,
  ACCESSIBILITY,
  WEB_PERFORMANCE,
  SEO_FUNDAMENTALS,
];
