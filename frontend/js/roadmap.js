/* ================================================================
   DoubleTap — roadmap.js
   Public feedback board: load posts, vote, suggest, comment, admin.
   ================================================================ */

const API = 'https://api.doubletap-app.com';
const ADMIN_EMAIL = 'hadidireya@gmail.com';
const STATUSES = ['suggested', 'under_review', 'planned', 'in_progress', 'shipped'];
const STATUS_LABELS = {
  suggested: 'Suggested',
  under_review: 'Under Review',
  planned: 'Planned',
  in_progress: 'In Progress',
  shipped: 'Shipped',
  declined: 'Declined',
};

/* ---------- DOM (cached) ---------- */
const board = document.getElementById('roadmap-board');
const authEl = document.getElementById('roadmap-auth');
const suggestOpen = document.getElementById('suggest-open');

const signinDialog = document.getElementById('signin-dialog');
const signinMsg = document.getElementById('signin-msg');
const magiclinkEmail = document.getElementById('magiclink-email');
const magiclinkSubmit = document.getElementById('magiclink-submit');

const suggestDialog = document.getElementById('suggest-dialog');
const suggestForm = document.getElementById('suggest-form');
const suggestTitleInput = document.getElementById('suggest-title-input');
const suggestBodyInput = document.getElementById('suggest-body-input');
const suggestSubmit = document.getElementById('suggest-submit');
const suggestMsg = document.getElementById('suggest-msg');

const detailDialog = document.getElementById('detail-dialog');
const detailTitle = document.getElementById('detail-title');
const detailBody = document.getElementById('detail-body');

/* ---------- State ---------- */
let session = null;
let openDetailId = null;

/* ---------- API ---------- */
const apiFetch = async (path, init = {}) => {
  const res = await fetch(API + path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* may have empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
};

const fetchSession = async () => {
  try {
    const data = await apiFetch('/auth/get-session');
    return data && data.user ? data : null;
  } catch (_) {
    return null;
  }
};

const fetchBoard = () => apiFetch('/feedback/posts');

const toggleVote = (postId) => apiFetch(`/feedback/posts/${postId}/vote`, { method: 'POST' });

const fetchPostDetail = (postId) => apiFetch(`/feedback/posts/${postId}`);

const submitSuggestion = (title, body) =>
  apiFetch('/feedback/posts', { method: 'POST', body: JSON.stringify({ title, body }) });

const submitComment = (postId, body) =>
  apiFetch(`/feedback/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });

const adminUpdatePost = (postId, updates) =>
  apiFetch(`/feedback/posts/${postId}`, { method: 'PATCH', body: JSON.stringify(updates) });

const adminDeletePost = (postId) =>
  apiFetch(`/feedback/posts/${postId}`, { method: 'DELETE' });

const OAUTH_HOSTS = new Set(['accounts.google.com', 'appleid.apple.com']);

const safeOauthRedirect = (raw) => {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && OAUTH_HOSTS.has(u.host);
  } catch (_) { return false; }
};

const startSocial = async (provider) => {
  const data = await apiFetch('/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({ provider, callbackURL: window.location.href }),
  });
  const target = data && typeof data.url === 'string' ? data.url : null;
  if (!target || !safeOauthRedirect(target)) throw new Error('untrusted_redirect');
  window.location.assign(target);
};

const sendMagicLink = (email) =>
  apiFetch('/auth/sign-in/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email, callbackURL: window.location.href }),
  });

const signOut = async () => {
  try {
    await apiFetch('/auth/sign-out', { method: 'POST' });
  } catch (_) { /* ignore */ }
};

/* ---------- Helpers ---------- */
const isAdmin = () => Boolean(session && session.user && session.user.email === ADMIN_EMAIL);

const formatRelative = (ms) => {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
};

const setMsg = (el, text, kind) => {
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('is-error', 'is-success');
  if (kind) el.classList.add(`is-${kind}`);
};

const ALLOWED_ATTRS = new Set([
  'id', 'class', 'type', 'href', 'src', 'alt', 'role', 'tabindex', 'title',
  'value', 'for', 'placeholder', 'minlength', 'maxlength', 'required',
  'referrerpolicy', 'data-comment-form',
  'aria-label', 'aria-pressed', 'aria-hidden', 'aria-current', 'aria-live',
]);

const el = (tag, opts = {}) => {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) {
    if (ALLOWED_ATTRS.has(k)) node.setAttribute(k, v);
  }
  if (opts.children) for (const c of opts.children) if (c) node.append(c);
  return node;
};

const verifiedBadge = () => {
  const span = el('span', { class: 'verified-badge', attrs: { title: 'Verified buyer' } });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M12 1l2.5 5 5.5.8-4 3.9.95 5.55L12 13.6l-4.95 2.65L8 10.7 4 6.8 9.5 6z');
  svg.append(path);
  span.append(svg);
  span.append('Buyer');
  return span;
};

const voteArrow = () => {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.classList.add('roadmap-card-vote-arrow');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M12 4l8 10h-5v6h-6v-6H4z');
  svg.append(path);
  return svg;
};

/* ---------- Auth UI ---------- */
const renderAuth = () => {
  authEl.replaceChildren();
  if (!session) {
    const btn = el('button', {
      class: 'btn btn-secondary',
      text: 'Sign in',
      attrs: { type: 'button' },
    });
    btn.addEventListener('click', () => openSignin());
    authEl.append(btn);
    suggestOpen.disabled = false;
    return;
  }
  const u = session.user;
  const wrap = el('div', { class: 'roadmap-auth-user' });
  const avatar = el('span', { class: 'roadmap-auth-avatar' });
  if (typeof u.image === 'string' && u.image.startsWith('https://')) {
    const img = el('img', { attrs: { src: u.image, alt: '', referrerpolicy: 'no-referrer' } });
    avatar.append(img);
  } else {
    avatar.textContent = (u.name || u.email || '?').slice(0, 1).toUpperCase();
  }
  const name = el('span', { class: 'roadmap-auth-name', text: u.name || u.email });
  const out = el('button', {
    class: 'roadmap-auth-signout',
    text: 'Sign out',
    attrs: { type: 'button' },
  });
  out.addEventListener('click', async () => {
    await signOut();
    session = null;
    renderAuth();
    loadBoard();
  });
  wrap.append(avatar, name, out);
  authEl.append(wrap);
  suggestOpen.disabled = false;
};

/* ---------- Card render ---------- */
const renderCard = (post) => {
  const card = el('div', { class: 'roadmap-card', attrs: { tabindex: '0', role: 'button' } });
  card.dataset.postId = post.id;

  const vote = el('button', {
    class: 'roadmap-card-vote' + (post.userVoted ? ' is-active' : ''),
    attrs: { type: 'button', 'aria-pressed': String(post.userVoted), 'aria-label': 'Vote' },
  });
  vote.append(voteArrow(), el('span', { class: 'roadmap-card-vote-count', text: String(post.voteCount) }));
  vote.addEventListener('click', (e) => {
    e.stopPropagation();
    handleVote(post.id, vote);
  });

  const content = el('div', { class: 'roadmap-card-content' });
  content.append(el('div', { class: 'roadmap-card-title', text: post.title }));
  content.append(el('div', { class: 'roadmap-card-body', text: post.body }));

  const meta = el('div', { class: 'roadmap-card-meta' });
  const author = el('span', {
    class: 'roadmap-card-author',
    text: post.author.name || 'Anonymous',
  });
  meta.append(author);
  if (post.author.isVerifiedBuyer) meta.append(verifiedBadge());
  if (post.commentCount > 0) {
    meta.append(el('span', {
      class: 'roadmap-card-comments',
      text: `${post.commentCount} comment${post.commentCount === 1 ? '' : 's'}`,
    }));
  }
  meta.append(el('span', { text: formatRelative(post.createdAt) }));
  content.append(meta);
  card.append(vote, content);

  const open = () => openDetail(post.id);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  return card;
};

const renderColumn = (status, posts) => {
  const column = board.querySelector(`.roadmap-column[data-status="${status}"]`);
  if (!column) return;
  const list = column.querySelector('[data-list]');
  const count = column.querySelector('[data-count]');
  count.textContent = String(posts.length);
  list.replaceChildren();
  if (posts.length === 0) {
    list.append(el('p', { class: 'roadmap-empty', text: 'Nothing here yet.' }));
    return;
  }
  for (const p of posts) list.append(renderCard(p));
};

const loadBoard = async () => {
  try {
    const data = await fetchBoard();
    for (const s of STATUSES) renderColumn(s, data[s] || []);
  } catch (err) {
    console.error('failed to load board', err);
    for (const s of STATUSES) {
      const list = board.querySelector(`.roadmap-column[data-status="${s}"] [data-list]`);
      if (list) list.replaceChildren(el('p', { class: 'roadmap-empty', text: 'Could not load.' }));
    }
  }
};

/* ---------- Vote ---------- */
const handleVote = async (postId, btn) => {
  if (!session) {
    openSignin();
    return;
  }
  btn.disabled = true;
  try {
    const { voted, voteCount } = await toggleVote(postId);
    btn.classList.toggle('is-active', voted);
    btn.setAttribute('aria-pressed', String(voted));
    const countEl = btn.querySelector('.roadmap-card-vote-count');
    if (countEl) countEl.textContent = String(voteCount);
  } catch (err) {
    if (err.status === 401) {
      session = null;
      renderAuth();
      openSignin();
    } else {
      console.error('vote failed', err);
    }
  } finally {
    btn.disabled = false;
  }
};

/* ---------- Sign-in dialog ---------- */
const openSignin = () => {
  setMsg(signinMsg, '');
  signinDialog.showModal();
};

document.querySelectorAll('.roadmap-provider').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const provider = btn.dataset.provider;
    if (!provider) return;
    setMsg(signinMsg, 'Redirecting…');
    try {
      await startSocial(provider);
    } catch (err) {
      setMsg(signinMsg, 'Sign-in unavailable. Try another method.', 'error');
    }
  });
});

magiclinkSubmit.addEventListener('click', async () => {
  const email = magiclinkEmail.value.trim();
  if (!email) {
    setMsg(signinMsg, 'Enter your email.', 'error');
    return;
  }
  magiclinkSubmit.disabled = true;
  setMsg(signinMsg, 'Sending…');
  try {
    await sendMagicLink(email);
    setMsg(signinMsg, 'Check your inbox for a sign-in link.', 'success');
  } catch (err) {
    setMsg(signinMsg, 'Could not send link. Try again later.', 'error');
  } finally {
    magiclinkSubmit.disabled = false;
  }
});

/* ---------- Suggest dialog ---------- */
suggestOpen.addEventListener('click', () => {
  if (!session) {
    openSignin();
    return;
  }
  setMsg(suggestMsg, '');
  suggestForm.reset();
  suggestDialog.showModal();
});

suggestSubmit.addEventListener('click', async () => {
  const title = suggestTitleInput.value.trim();
  const body = suggestBodyInput.value.trim();
  if (title.length < 3) { setMsg(suggestMsg, 'Title is too short.', 'error'); return; }
  if (body.length < 10) { setMsg(suggestMsg, 'Add a bit more detail.', 'error'); return; }
  suggestSubmit.disabled = true;
  setMsg(suggestMsg, 'Submitting…');
  try {
    await submitSuggestion(title, body);
    setMsg(suggestMsg, 'Submitted!', 'success');
    setTimeout(() => suggestDialog.close(), 600);
    loadBoard();
  } catch (err) {
    let msg = 'Could not submit.';
    if (err.message === 'unauthorized') msg = 'Please sign in.';
    else if (err.message === 'title_invalid') msg = 'Title must be 3–120 characters.';
    else if (err.message === 'body_invalid') msg = 'Details must be 10–2000 characters.';
    else if (err.message) msg = `Could not submit: ${err.message}`;
    setMsg(suggestMsg, msg, 'error');
  } finally {
    suggestSubmit.disabled = false;
  }
});

/* ---------- Detail dialog ---------- */
const renderDetail = (post) => {
  detailTitle.textContent = post.title;
  detailBody.replaceChildren();

  const meta = el('div', { class: 'roadmap-detail-meta' });
  meta.append(el('span', { class: 'roadmap-detail-status', text: STATUS_LABELS[post.status] || post.status }));
  meta.append(el('span', { text: post.author.name || 'Anonymous' }));
  if (post.author.isVerifiedBuyer) meta.append(verifiedBadge());
  meta.append(el('span', { text: formatRelative(post.createdAt) }));
  meta.append(el('span', { text: `${post.voteCount} vote${post.voteCount === 1 ? '' : 's'}` }));
  detailBody.append(meta);

  detailBody.append(el('p', { class: 'roadmap-detail-body', text: post.body }));

  if (isAdmin()) {
    const adminWrap = el('div', { class: 'roadmap-admin-controls' });
    adminWrap.append(el('label', { text: 'Admin: change status', attrs: { for: 'admin-status' } }));
    const select = el('select', { attrs: { id: 'admin-status' } });
    for (const s of [...STATUSES, 'declined']) {
      const opt = el('option', { text: STATUS_LABELS[s], attrs: { value: s } });
      if (s === post.status) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', async () => {
      try {
        await adminUpdatePost(post.id, { status: select.value });
        loadBoard();
        if (openDetailId === post.id) {
          const fresh = await fetchPostDetail(post.id);
          renderDetail(fresh);
        }
      } catch (err) { console.error('admin update failed', err); }
    });
    adminWrap.append(select);

    const del = el('button', { class: 'btn btn-secondary', text: 'Delete post', attrs: { type: 'button' } });
    del.addEventListener('click', async () => {
      if (!window.confirm('Delete this post? This cannot be undone.')) return;
      try {
        await adminDeletePost(post.id);
        detailDialog.close();
        loadBoard();
      } catch (err) { console.error('admin delete failed', err); }
    });
    adminWrap.append(del);
    detailBody.append(adminWrap);
  }

  detailBody.append(el('h3', { class: 'roadmap-section-label', text: `Comments (${post.comments.length})` }));

  const list = el('ul', { class: 'roadmap-comment-list' });
  if (post.comments.length === 0) {
    list.append(el('li', { class: 'roadmap-empty', text: 'No comments yet.' }));
  } else {
    for (const c of post.comments) {
      const li = el('li', { class: 'roadmap-comment' });
      const head = el('div', { class: 'roadmap-comment-head' });
      head.append(el('span', { text: c.author.name || 'Anonymous' }));
      if (c.author.isVerifiedBuyer) head.append(verifiedBadge());
      head.append(el('span', { text: formatRelative(c.createdAt) }));
      li.append(head);
      li.append(el('p', { class: 'roadmap-comment-body', text: c.body }));
      list.append(li);
    }
  }
  detailBody.append(list);

  if (session) {
    const form = el('form', { class: 'roadmap-comment-form', attrs: { 'data-comment-form': 'true' } });
    const ta = el('textarea', {
      attrs: { placeholder: 'Add a comment…', maxlength: '2000', required: 'true' },
    });
    const submit = el('button', { class: 'btn btn-primary', text: 'Comment', attrs: { type: 'submit' } });
    form.append(ta, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (text.length < 1) return;
      submit.disabled = true;
      try {
        await submitComment(post.id, text);
        const fresh = await fetchPostDetail(post.id);
        renderDetail(fresh);
        loadBoard();
      } catch (err) {
        console.error('comment failed', err);
        submit.disabled = false;
      }
    });
    detailBody.append(form);
  } else {
    const cta = el('button', { class: 'btn btn-secondary', text: 'Sign in to comment', attrs: { type: 'button' } });
    cta.addEventListener('click', () => { detailDialog.close(); openSignin(); });
    detailBody.append(cta);
  }
};

const openDetail = async (postId) => {
  openDetailId = postId;
  detailTitle.textContent = '…';
  detailBody.replaceChildren(el('p', { class: 'roadmap-empty', text: 'Loading…' }));
  detailDialog.showModal();
  try {
    const post = await fetchPostDetail(postId);
    if (openDetailId === postId) renderDetail(post);
  } catch (err) {
    detailBody.replaceChildren(el('p', { class: 'roadmap-empty', text: 'Could not load post.' }));
  }
};

detailDialog.addEventListener('close', () => { openDetailId = null; });

/* ---------- Init ---------- */
(async () => {
  session = await fetchSession();
  renderAuth();
  await loadBoard();
})();
