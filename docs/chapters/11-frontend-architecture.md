# Chapter 11 — Frontend Architecture

## What You'll Learn

This chapter covers every layer of the React frontend: the routing setup, the theme system, the auth context, the authentication flows and their state machines, the animated logo (including the math behind it), the Identicon avatar with WCAG contrast enforcement, the ParticleField background, the Settings page, and the PWA configuration.

---

## 11.1 React 18, React Router v6, and the SPA Structure

The application is a [SPA](../glossary/README.md#spa) (Single Page Application). The initial HTML shell is served from `dist/index.html` (built by Vite). All routes are handled client-side by React Router v6.

**Entry point (`src/main.jsx`):**

```jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Application shell (`src/App.jsx`):**

```jsx
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

The provider order matters. `ThemeProvider` is outermost because auth components use theme tokens. `AuthProvider` wraps the router because some route navigation logic (redirect to `/auth` when not logged in) depends on the auth state.

**Routes (in `Shell`):**

```jsx
<Routes>
  <Route index element={<Home />} />
  <Route path="/auth" element={<Auth />} />
  <Route path="/account/settings" element={<Settings />} />
</Routes>
```

All three pages are lazy-loaded:

```jsx
const Home = lazy(() => import('./pages/Home'));
const Auth = lazy(() => import('./pages/Auth'));
const Settings = lazy(() => import('./pages/Security'));
```

**`ScrollToTop`:** A utility component that calls `window.scrollTo(0, 0)` on every route change. Without this, navigating from a scrolled-down Home page to the Settings page would leave the user mid-page.

**`NumMatchApprovalModal`:** Rendered at the app shell level (not inside any specific page) so it appears regardless of which page is active:

```jsx
{approval && <NumMatchApprovalModal approval={approval} onRespond={respond} />}
```

---

## 11.2 Vite Configuration and Build

The build is configured in `vite.config.js`. Key decisions:

**Manual chunks:**
```js
rollupOptions: {
  output: {
    manualChunks: {
      vendor: ['react', 'react-dom', 'react-router-dom'],
      motion: ['framer-motion']
    }
  }
}
```

Splitting React/Router and Framer Motion into separate chunks means they can be cached independently. If only the app code changes, the browser doesn't re-download the vendor bundle.

**Path alias:**
```js
resolve: { alias: { '@': '/src' } }
```

This allows imports like `import { useAuth } from '@/hooks/useAuth'` instead of relative paths. However, in the actual codebase, relative imports are used throughout — the alias exists but is not heavily used.

**PWA plugin:**
```js
VitePWA({
  registerType: 'autoUpdate',
  ...
})
```

`autoUpdate` means the service worker silently updates in the background when a new version is deployed. The user does not need to manually reload.

---

## 11.3 The Theme System

The theme system (`src/hooks/useTheme.jsx`) is built on React context with three preference levels:

- `'auto'` — follows the OS `prefers-color-scheme` media query
- `'light'` — always light
- `'dark'` — always dark

**Theme tokens:**

```js
export const themes = {
  dark: {
    bg: '#08080c', surface: '#11111a', ...
    accent: '#64ffda', accentMuted: '#3fbfa3',
    text1: '#e8e8f0', text2: '#a4a4bc', text3: '#7e7e98',
    ...
  },
  light: {
    bg: '#faf9f7', surface: '#ffffff', ...
    accent: '#0a6b55', accentMuted: '#1a7d66',
    text1: '#1a1a1a', text2: '#4a4a4a', text3: '#717171',
    ...
  },
};
```

The dark theme uses `#64ffda` (a cyan-green) as the accent. The light theme uses `#0a6b55` (a deep teal) for the same semantic role — both are accessible against their respective backgrounds but appear visually consistent.

**Auto mode with OS change tracking:**

```js
useEffect(() => {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = e => setSystemTheme(e.matches ? 'light' : 'dark');
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}, []);
```

If the user has chosen `'auto'` and switches their OS from dark to light mode, the app immediately updates without a page reload.

The preference is persisted to `localStorage`:

```js
useEffect(() => {
  localStorage.setItem('theme-pref', preference);
}, [preference]);
```

**ThemeToggle component:** A 3-segment pill (Auto / Sun / Moon icons) rendered in the footer and in the Settings > Account tab. Uses `aria-pressed` for accessibility.

---

## 11.4 The `useAuth` Hook

```js
// src/hooks/useAuth.jsx
const ENABLED = import.meta.env.VITE_ENABLE_AUTH === 'true';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(ENABLED ? undefined : null);

  useEffect(() => {
    if (!ENABLED) return;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(({ user }) => setUser(user || null))
      .catch(() => setUser(null));
  }, []);
```

**Three state values for `user`:**
- `undefined` — loading (auth check in progress)
- `null` — not signed in
- `{ userId, nickname, maskedEmail }` — signed in

The `loading` property is derived: `user === undefined`.

When `VITE_ENABLE_AUTH` is not `'true'`, `user` starts as `null` (not `undefined`), so loading is never true and the app renders as if auth does not exist. This allows deploying the portfolio without auth functionality.

The `setUser` function is exposed in the context so components can update the user state after successful operations (e.g., `onSuccess` in `Auth.jsx` calls `setUser(user)` after `/me` returns the new user).

---

## 11.5 The Auth-Gated Landing Page

`Home.jsx` implements two distinct views based on auth state:

```jsx
const authenticated = !enabled || (!loading && !!user);
const showGuest = enabled && !loading && !user;

return (
  <>
    {showGuest ? <GuestView /> : (
      <>
        <Hero />
        {authenticated && (
          <>
            <StatsBar />
            <ProjectsSection />
            ...
          </>
        )}
      </>
    )}
  </>
);
```

**GuestView:** A centered card showing the headshot, name, title, and a "Sign in →" link. No portfolio content is visible.

**Authenticated view:** The full Hero section with the particle field, stats, projects, skills, philosophy, timeline, education, and CTA sections.

**The loading state:** While `user === undefined` (loading), neither GuestView nor the full content renders — the page is empty (except the Nav). This prevents the flash of "guest → authenticated" that would occur if the guest view were shown during loading.

---

## 11.6 The Auth Page State Machines

The `Auth.jsx` page contains three independent flow components, each with its own state machine:

### `RegisterFlow`

**States:** step 0 (email) → step 1 (OTP verify) → step 2 (passkey prompt) → trust modal → recovery codes modal

Step 2 transitions to the trust modal by setting `showTrust = true` and storing `pendingToken` and `recoveryCodes` in state. The trust modal calls `finaliseSession(pendingToken, trusted, deviceName)`. After session creation, recovery codes are shown in `RecoveryCodesModal`.

### `SignInFlow`

**States:** view 'email' → view 'passkey' → (optional: view 'recovery') → trust modal

Additionally, `numMatchCode` and `numMatchTemp` state trigger the `NumberMatchScreen`. When the WebSocket delivers `result.approved`, the flow transitions to the trust modal. When denied, it reverts to the passkey view with an error message.

Conditional mediation runs in parallel as a `useEffect` — it is cancelled (`condActiveRef.current = false`) when the user manually submits the email form.

### `RecoverFlow`

**States:** step 0 (email) → step 1 (recovery code) → step 2 (OTP) → step 3 (passkey register) → trust modal → recovery codes modal

Note: step 0 just stores the email locally, step 1 submits to `/recovery/start`. This is split so the user sees "Enter email" then "Enter recovery code" as distinct visual steps.

---

## 11.7 The `TrustDeviceModal` and `RecoveryCodesModal`

Both modals are rendered as overlays (`position: fixed, inset: 0`) with a blurred backdrop. They are components defined in `Auth.jsx` and rendered when the respective flags are set.

**`TrustDeviceModal`:** Shows a 30-day vs 24-hour explanation and an optional device name input. Has two action buttons: "Not now" (untrusted) and "Trust this device" (trusted). Calls `onFinish({ trusted, deviceName })`.

**`RecoveryCodesModal`:** Shows the 8 recovery codes in a 2-column grid. Has "Copy all" (copies to clipboard with a brief visual confirmation) and "I've saved them →" (advances to the home page). This modal is shown once — the codes are never retrievable again from the UI.

---

## 11.8 The Animated Logo

The nav logo (`LogoMark` in `src/components/Nav.jsx`) has an animated terminal-prefix that cycles through programming symbols on hover and smoothly settles back to `~/` on mouse-leave. This uses `requestAnimationFrame` ([rAF](../glossary/README.md#raf)) directly — no animation library.

**The symbol set:**

```js
const SYMBOLS = ['~/', './', '> ', '$ ', '# ', '=>', '::', '&&', '<>', '**', '//', 'λ ', '∑ ', '∇ ', '∂ ', 'φ ', 'π '];
```

A mix of shell prefixes (`~/`, `./`, `> `, `$ `), programming operators (`=>`, `::`, `&&`, `<>`), math symbols (`λ`, `∑`, `∇`, `∂`, `φ`, `π`), and comment markers (`//`). These are drawn from the domains the portfolio site represents: systems programming, command line, mathematics, and software architecture.

**The cycling math (hover state):**

```js
const PHI = 1.6180339887;
const BASE_MS = 520;

const cycleLen = BASE_MS * PHI; // ≈ 841ms per full symbol cycle
const pos = (elapsed / cycleLen) % SYMBOLS.length;
const idx = Math.floor(pos) % SYMBOLS.length;
const phase = pos - Math.floor(pos); // 0.0 → 1.0 within current symbol
```

The cycle length is `BASE_MS × PHI` where `PHI` is the [golden ratio](../glossary/README.md#golden-ratio) (≈1.618). This produces an irrational cycle time, which prevents the animation from feeling mechanical. With a rational cycle, the symbols would align with the browser's 60fps refresh grid predictably; with an irrational multiplier, each symbol lingers for a slightly different number of frames.

**Opacity and color animation (bell curve envelope):**

```js
const env = Math.sin(phase * Math.PI); // 0 → 1 → 0 over the symbol's phase
el.style.opacity = String(0.35 + 0.65 * env);
el.style.color = lerpColor('#4b5563', '#6366f1', env);
```

`Math.sin(phase * π)` produces a bell curve over the range [0, 1]: starts at 0, peaks at 1 (midpoint), returns to 0. This makes each symbol fade in and out. Opacity ranges from 0.35 (dimmed, at symbol boundaries) to 1.0 (full, at midpoint). Color interpolates between `#4b5563` (muted gray) and `#6366f1` (indigo) with the same bell curve.

**Y-axis bounce (damped sine):**

```js
const y = (1 - phase) * Math.sin(phase * Math.PI * 2) * -5;
```

This is `(1 - phase) × sin(phase × 2π) × -5`. The `sin(phase × 2π)` component produces one full sine oscillation over the symbol phase. The `(1 - phase)` term is a linear decay that dampens the oscillation to zero as `phase → 1`. The result is a quick upward bounce at the start of each symbol that dampen to zero by the next symbol. The `-5` scales to pixels.

This is a simplified [damped oscillation](../glossary/README.md#damped-oscillation) — not the full exponential-decay formula, but effective for a short animation.

**Settle animation (mouse leave):**

```js
const t = Math.min((ts - s.leaveTime) / SETTLE_MS, 1); // 0 → 1 over 340ms
const ease = 0.5 - 0.5 * Math.cos(t * Math.PI); // cosine ease-in-out
el.style.opacity = String(1 - ease);
el.style.color = lerpColor('#4b5563', '#6366f1', 1 - ease);
el.style.transform = `translateY(${(s.leaveFromY * (1 - ease)).toFixed(2)}px)`;
```

When the mouse leaves, the animation captures the current symbol, opacity, color, and Y offset. It then eases all three back to `~/` at opacity 1, color gray, Y=0 over 340ms using a cosine ease curve (`0.5 - 0.5 × cos(t × π)`). This curve is smooth at both ends (zero derivative at t=0 and t=1) — the classic "ease-in-out" shape.

The settle captures `leaveFromY` (the Y offset at leave time) so the settle starts from wherever the bounce was and returns to 0, not just resetting suddenly.

---

## 11.9 The Identicon Component

The `Identicon` component in `src/components/Nav.jsx` generates a deterministic GitHub-style 5×5 symmetric avatar from an email string.

**Hash function:**

```js
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
```

`Math.imul` is 32-bit integer multiply, matching Java's `String.hashCode()` behavior. This is not a cryptographic hash — it is a deterministic pseudorandom hash sufficient for deriving visual properties.

**Seeded RNG:**

```js
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
```

Linear congruential generator (LCG) seeded from the hash. Constants 1664525 and 1013904223 are from Knuth's TAOCP. This produces a consistent sequence of "random" values from the same seed, ensuring the same email always produces the same avatar.

**WCAG contrast enforcement:**

```js
function ensureContrast(hue, fgSat, bgSat, fgL, bgL, target = 4.5) {
  const [br, bg_, bb] = hslToRgb(hue, bgSat, bgL);
  const bgLum = relativeLuminance(br, bg_, bb);
  const lightBg = bgL >= 50;
  let l = fgL;
  const step = lightBg ? -1 : 1;
  // ...walk lightness until contrast target is met
}
```

Starting from an initial foreground lightness (60%), the function steps the lightness darker (for light backgrounds) or lighter (for dark backgrounds) until the WCAG contrast ratio of 3.0 is achieved. This uses the [WCAG](../glossary/README.md#wcag) contrast ratio formula: `(max(L1, L2) + 0.05) / (min(L1, L2) + 0.05)` where L is relative luminance.

The target is 3.0:1 (the WCAG AA requirement for non-text elements, per SC 1.4.11). This ensures the avatar is visually distinguishable even at small sizes and across diverse color hues.

**The 5×5 grid:**

A 300×300 canvas is used internally (regardless of the display `size`), downscaled by CSS. The browser's image downsampling provides natural antialiasing.

The grid is 5 columns × 5 rows. Only the left 3 columns are randomly filled; the right 2 mirror the left 2. This creates bilateral symmetry, which is what makes GitHub-style identicons visually appealing — they look like stylized faces or geometric patterns rather than random noise.

A minimum of 5 filled cells is enforced to prevent empty-looking avatars.

---

## 11.10 The ParticleField Background

`src/components/ParticleField.jsx` renders a canvas-based particle animation as the Hero section background. Key design choices:

- 40 particles, each with random position, velocity, radius (0.4–1.5px), and opacity (0.05–0.33)
- Mouse repulsion: particles within 85px of the cursor are pushed away
- Velocity damping: `vx *= 0.992`, `vy *= 0.992` — particles slow naturally over time
- Connection lines: particles within 105px of each other draw a faint line, opacity proportional to distance
- Toroidal wrapping: particles that go off one edge appear on the other

The animation uses `requestAnimationFrame` and is cancelled on component unmount. It respects `prefers-reduced-motion` by not rendering at all when reduced motion is preferred (returns early from the `useEffect`).

---

## 11.11 The Settings Page

`src/pages/Security.jsx` is a settings page with two tabs: Security and Account.

**Security tab sections:**
- **Active sessions:** Lists all active sessions with device name, last-active time, trusted badge, current-session highlight, and IP reveal. "Revoke" button per non-current session. "Revoke all other sessions" bulk action.
- **Passkeys:** Lists registered passkeys with synced/device-bound badge, creation date, last-used time. "Remove" button (disabled when only one passkey remains).
- **Recovery codes:** Shows `N of 8 remaining` with color-coded badge (green/amber/red). "Regenerate" button shows new codes inline after confirmation.
- **Recent activity:** Last 20 security events with color-coded labels and IP reveal.
- **Delete account:** Red danger zone. Initiates step-up auth, then shows email confirmation modal.

**Account tab:**
- **Appearance:** ThemeToggle embedded in a settings row.

The `RevealIP` component hides IPs behind a "Reveal IP" button to avoid accidental leakage when someone is screen-sharing or recording. Clicking reveals the IP in place.

---

## 11.12 PWA Configuration

The [PWA](../glossary/README.md#pwa) is configured through `vite-plugin-pwa` in `vite.config.js`:

```js
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg', 'robots.txt', 'icon-192.png', 'icon-512.png'],
  manifest: {
    name: 'Varun Ragunathan — Staff Engineer',
    short_name: 'Varun R.',
    theme_color: '#08080c',
    background_color: '#08080c',
    display: 'standalone',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 } }
      }
    ]
  }
})
```

**`display: 'standalone'`:** When installed as a PWA, the app runs without browser chrome (no address bar). It looks like a native app.

**`purpose: 'maskable'`:** The 512×512 icon with `purpose: 'maskable'` allows Android to apply its adaptive icon treatment (rounded corners, etc.) without cropping important content.

**Workbox [CacheFirst](https://developer.chrome.com/docs/workbox/caching-strategies-overview/) for Google Fonts:** Fonts are cached for 1 year, served from cache on every load after the first visit. This eliminates the Google Fonts round-trip after initial caching.

**`registerType: 'autoUpdate'`:** The service worker is silently replaced when a new version is detected. The user does not see an "Update available" notification.

---

## Key Takeaways

- The app is a lazy-loaded SPA with three pages: Home, Auth, Settings. The `NumMatchApprovalModal` lives at the shell level and appears on any page.
- The theme system has three levels (auto/light/dark), tracks OS preference changes, and persists to localStorage.
- The auth context exposes `user` in three states: `undefined` (loading), `null` (signed out), object (signed in). Loading state prevents flicker.
- The logo animation uses `requestAnimationFrame`, golden-ratio cycle timing, a sine bell curve for opacity, a damped sine for Y-axis bounce, and a cosine ease for the settle.
- The Identicon generates a WCAG-compliant avatar deterministically from an email, using a seeded LCG and a 5×5 symmetric grid.
- The PWA is configured for autoUpdate, maskable icons, and 1-year font caching.
