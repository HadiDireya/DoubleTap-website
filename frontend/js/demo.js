/* ================================================================
   DoubleTap — demo.js
   On localhost only: monkey-patch window.fetch to intercept calls
   to api.doubletap-app.com and return canned demo data. Lets the
   roadmap/feedback pages preview without network or auth.
   On production this script no-ops.
   ================================================================ */

const HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '']);
if (HOSTS.has(location.hostname)) {
  // Pravatar gives stable, https avatars seeded by `?u=...` so the
  // same author keeps the same face across reloads. A handful of
  // demo authors get photos; the rest fall back to initials.
  const pic = (seed) => `https://i.pravatar.cc/96?u=${encodeURIComponent(seed)}`;

  const SESSION = {
    user: {
      id: 'demo-hadi',
      name: 'Hadi',
      email: 'hadidireya@gmail.com',
      image: pic('hadi.direya'),
    },
  };
  let signedIn = true;

  const now = Date.now();
  const ago = (ms) => now - ms;
  const day = 86400000;
  const hour = 3600000;

  // Post shape mirrors the real API: id, type, status, title, body,
  // voteCount, userVoted, commentCount, createdAt, author{ name,
  // isVerifiedBuyer }, comments[]. Comments stay attached so the
  // detail dialog can read them; the board endpoint strips them.
  const POSTS = [
    {
      id: 'p1',
      type: 'feature',
      status: 'in_progress',
      title: 'Workspace-aware shortcuts',
      body: "Trigger different actions depending on the active app. Right now I have to live with one global mapping; it would be amazing to scope per-app.\n\nUse case: in Figma, double-tap to toggle UI; in Xcode, double-tap to build.",
      voteCount: 47,
      userVoted: true,
      commentCount: 2,
      createdAt: ago(3 * day),
      author: { name: 'lucia.k', isVerifiedBuyer: true, image: pic('lucia.k') },
      comments: [
        { id: 'c1', body: 'Massive +1 — per-app context is the missing piece for me too.', createdAt: ago(2 * day), author: { name: 'martin', isVerifiedBuyer: true, image: pic('martin') } },
        { id: 'c2', body: 'Could this support regex on bundle id? Some apps swap identifiers between dev/release builds.', createdAt: ago(20 * hour), author: { name: 'oren', isVerifiedBuyer: false } },
      ],
    },
    {
      id: 'p2',
      type: 'feature',
      status: 'planned',
      title: 'Sync settings across machines',
      body: 'I run DoubleTap on three Macs and reconfiguring it every time is painful. iCloud or anything would do.',
      voteCount: 31,
      userVoted: false,
      commentCount: 1,
      createdAt: ago(7 * day),
      author: { name: 'martin', isVerifiedBuyer: true, image: pic('martin') },
      comments: [
        { id: 'c3', body: 'Even a simple JSON export/import would unblock the team-onboarding case.', createdAt: ago(5 * day), author: { name: 'priya.k', isVerifiedBuyer: true, image: pic('priya.k') } },
      ],
    },
    {
      id: 'p3',
      type: 'feature',
      status: 'under_review',
      title: 'Run AppleScript on tap',
      body: 'Today I have to wrap every script in a Shortcut just to trigger it. Native AppleScript support would cut a step.',
      voteCount: 18,
      userVoted: false,
      commentCount: 0,
      createdAt: ago(2 * day),
      author: { name: 'davide.r', isVerifiedBuyer: false },
      comments: [],
    },
    {
      id: 'p4',
      type: 'feature',
      status: 'suggested',
      title: 'Per-modifier visual hints',
      body: 'When I hold a modifier, show a tiny HUD with which actions are bound. Think of it as menubar discoverability for chord users.',
      voteCount: 9,
      userVoted: false,
      commentCount: 0,
      createdAt: ago(5 * hour),
      author: { name: 'tomek', isVerifiedBuyer: false },
      comments: [],
    },
    {
      id: 'p5',
      type: 'feature',
      status: 'shipped',
      title: 'Stream Deck integration',
      body: 'You can now bind any DoubleTap action to a Stream Deck button with the new plugin. Setup takes about a minute — read the launch post for the walkthrough.',
      voteCount: 64,
      userVoted: true,
      commentCount: 1,
      createdAt: ago(14 * day),
      author: { name: 'hadi', isVerifiedBuyer: true, image: pic('hadi.direya') },
      comments: [
        { id: 'c4', body: 'Been waiting for this. The new modifier-press-through is chef\'s kiss.', createdAt: ago(13 * day), author: { name: 'aria', isVerifiedBuyer: true, image: pic('aria') } },
      ],
    },
    {
      id: 'p6',
      type: 'bug',
      status: 'under_review',
      title: 'Cmd-Tab loses focus after wake',
      body: 'After waking from sleep on an external display, the first Cmd-Tab does nothing. Have to click somewhere then it works again. Repros every time on M1 + LG 5K, macOS 14.5.',
      voteCount: 28,
      userVoted: false,
      commentCount: 2,
      createdAt: ago(2 * day),
      author: { name: 'samia', isVerifiedBuyer: true, image: pic('samia') },
      comments: [
        { id: 'c5', body: 'Confirmed on my M2 with LG UltraFine — looking into it.', createdAt: ago(1 * day), author: { name: 'hadi', isVerifiedBuyer: true, image: pic('hadi.direya') } },
        { id: 'c6', body: 'Reverting to 0.8.2 made it go away here.', createdAt: ago(4 * hour), author: { name: 'oren', isVerifiedBuyer: false } },
      ],
    },
    {
      id: 'p7',
      type: 'bug',
      status: 'in_progress',
      title: 'Menubar icon disappears on second display',
      body: 'When DoubleTap is set to show only on the active display, switching displays sometimes loses the icon entirely. macOS 14.5.',
      voteCount: 13,
      userVoted: false,
      commentCount: 0,
      createdAt: ago(7 * day),
      author: { name: 'priya.k', isVerifiedBuyer: true, image: pic('priya.k') },
      comments: [],
    },
    {
      id: 'p8',
      type: 'praise',
      status: 'suggested',
      title: 'This replaced three apps for me',
      body: 'Was running Karabiner + Hammerspoon + a homebrew script. DoubleTap does all of it in 30 seconds of setup. Money very well spent.',
      voteCount: 19,
      userVoted: true,
      commentCount: 0,
      createdAt: ago(6 * hour),
      author: { name: 'jonas', isVerifiedBuyer: true, image: pic('jonas') },
      comments: [],
    },
    {
      id: 'p9',
      type: 'praise',
      status: 'suggested',
      title: 'Best $19 I spent this year',
      body: 'No notes. Fast, quiet, just works. The little radial menu on long-press alone earned its keep.',
      voteCount: 11,
      userVoted: false,
      commentCount: 0,
      createdAt: ago(2 * day),
      author: { name: 'aria', isVerifiedBuyer: true, image: pic('aria') },
      comments: [],
    },
    {
      id: 'p10',
      type: 'feature',
      status: 'shipped',
      title: 'Export config as a file',
      body: 'Sharing my setup with the team would be great. JSON or .doubletap file we can hand off.',
      voteCount: 36,
      userVoted: true,
      commentCount: 0,
      createdAt: ago(21 * day),
      author: { name: 'leo', isVerifiedBuyer: true },
      comments: [],
    },
  ];

  const getById = (id) => POSTS.find((p) => p.id === id);

  // Board response shape: posts grouped by status. Strip comments
  // so payload size matches what the real API would send for a list.
  const board = () => {
    const out = { suggested: [], under_review: [], planned: [], in_progress: [], shipped: [] };
    for (const p of POSTS) {
      const bucket = out[p.status];
      if (!bucket) continue;
      const { comments, ...rest } = p;
      bucket.push(rest);
    }
    return out;
  };

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.startsWith('https://api.doubletap-app.com')) return realFetch(input, init);

    const path = url.replace('https://api.doubletap-app.com', '');
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? (() => { try { return JSON.parse(init.body); } catch (_) { return {}; } })() : {};

    // ---- Auth ----
    if (path === '/auth/get-session' && method === 'GET') {
      return json(signedIn ? SESSION : null);
    }
    if (path === '/auth/sign-out' && method === 'POST') {
      signedIn = false;
      return json({ ok: true });
    }
    // OAuth in demo: return an unsafe host so the page-side safety
    // check fails and shows "Sign-in unavailable" instead of
    // navigating away from localhost. Magic-link is the working path.
    if (path === '/auth/sign-in/social' && method === 'POST') {
      return json({ url: 'http://localhost:1/oauth-disabled-in-demo' });
    }
    if (path === '/auth/sign-in/magic-link' && method === 'POST') {
      // Pretend the email landed; flip the flag so a page refresh
      // restores the signed-in experience.
      signedIn = true;
      return json({ ok: true });
    }

    // ---- Board ----
    if (path === '/feedback/posts' && method === 'GET') {
      return json(board());
    }
    if (path === '/feedback/posts' && method === 'POST') {
      const post = {
        id: 'p' + Date.now(),
        type: body.type || 'feature',
        status: 'suggested',
        title: String(body.title || '').slice(0, 120),
        body: String(body.body || '').slice(0, 2000),
        voteCount: 1,
        userVoted: true,
        commentCount: 0,
        createdAt: Date.now(),
        author: { name: SESSION.user.name, isVerifiedBuyer: true },
        comments: [],
      };
      POSTS.unshift(post);
      const { comments, ...rest } = post;
      return json(rest);
    }

    // ---- Single post ----
    const detail = path.match(/^\/feedback\/posts\/([^/]+)$/);
    if (detail) {
      const p = getById(detail[1]);
      if (method === 'GET') return p ? json(p) : json({ error: 'not_found' }, 404);
      if (method === 'PATCH') {
        if (!p) return json({ error: 'not_found' }, 404);
        Object.assign(p, body);
        return json(p);
      }
      if (method === 'DELETE') {
        const i = POSTS.findIndex((x) => x.id === detail[1]);
        if (i >= 0) POSTS.splice(i, 1);
        return json({ ok: true });
      }
    }

    // ---- Vote ----
    const vote = path.match(/^\/feedback\/posts\/([^/]+)\/vote$/);
    if (vote && method === 'POST') {
      if (!signedIn) return json({ error: 'unauthorized' }, 401);
      const p = getById(vote[1]);
      if (!p) return json({ error: 'not_found' }, 404);
      p.userVoted = !p.userVoted;
      p.voteCount += p.userVoted ? 1 : -1;
      return json({ voted: p.userVoted, voteCount: p.voteCount });
    }

    // ---- Comment ----
    const cm = path.match(/^\/feedback\/posts\/([^/]+)\/comments$/);
    if (cm && method === 'POST') {
      if (!signedIn) return json({ error: 'unauthorized' }, 401);
      const p = getById(cm[1]);
      if (!p) return json({ error: 'not_found' }, 404);
      const c = {
        id: 'c' + Date.now(),
        body: String(body.body || '').slice(0, 2000),
        createdAt: Date.now(),
        author: { name: SESSION.user.name, isVerifiedBuyer: true },
      };
      p.comments.push(c);
      p.commentCount = p.comments.length;
      return json(c);
    }

    return json({ error: 'demo_unhandled', path, method }, 404);
  };

  console.warn('[DoubleTap demo] localhost detected — API calls are intercepted with demo data.');
}
