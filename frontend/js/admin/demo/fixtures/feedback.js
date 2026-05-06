import { ADMIN_EMAIL } from "../../config.js";

export const feedbackFixture = (path) => {
  if (path.startsWith("/admin/feedback/")) {
    const suffix = path.slice("/admin/feedback/".length).split("?")[0];
    // Action endpoints (PATCH /:id/status, DELETE /:id, DELETE /:id/comments/:cid)
    // — return ok. The frontend uses status code from the method, not from the
    // body, so noop:false is fine.
    if (suffix.includes("/")) return { ok: true };
    const id = decodeURIComponent(suffix);
    const now = Date.now();
    // Detail fixture: pretend "p_with_comments" carries a thread; the
    // others are bare posts. Mirrors the list fixture.
    const isWithComments = id === "p_with_comments";
    const isBug = id === "p_bug";
    const isPraise = id === "p_praise";
    return {
      id,
      type: isBug ? "bug" : isPraise ? "praise" : "feature",
      title: isBug
        ? "Double-tap of right ⌘ doesn't fire the action"
        : isPraise
          ? "Switching from BetterTouchTool — DoubleTap nailed it"
          : "Per-app trigger overrides for Spotlight remap",
      body: "Steps to reproduce:\n1. Map right ⌘ to Spotlight.\n2. Lock the screen, then unlock.\n3. Double-tap right ⌘ — nothing happens.\nExpected: Spotlight opens. Actual: silent.",
      status: "suggested",
      created_at: new Date(now - 7 * 86400_000).toISOString(),
      updated_at: new Date(now - 7 * 86400_000).toISOString(),
      author: {
        id: "u_alice", name: "Alice Demo", email: "alice@example.com", image: null,
      },
      vote_count: isWithComments ? 14 : isPraise ? 6 : 3,
      comments: isWithComments
        ? [
            { id: "c2", body: "Same on my M3 Air. Reverting to v1.4.1 fixes it.",
              created_at: new Date(now - 1 * 86400_000).toISOString(),
              author: { id: "u_bob", name: "Bob Tester", email: "bob@example.com" } },
            { id: "c1", body: "Repro confirmed — opening a ticket.",
              created_at: new Date(now - 2 * 86400_000).toISOString(),
              author: { id: "u_admin", name: "Hadi", email: ADMIN_EMAIL } },
          ]
        : [],
      // Match the response shape after the audit-detail enrichment fix
      // — feedback.update_status now snapshots author_email/author_name
      // alongside from/to/title for parity with delete-post.
      audit: [
        { id: "fa1", actor_email: ADMIN_EMAIL, action: "feedback.update_status",
          target_type: "feedback_post", target_id: id,
          details: JSON.stringify({
            from: "suggested",
            to: "under_review",
            title: isBug
              ? "Double-tap of right ⌘ doesn't fire the action"
              : isPraise
                ? "Switching from BetterTouchTool — DoubleTap nailed it"
                : "Per-app trigger overrides for Spotlight remap",
            author_email: "alice@example.com",
            author_name: "Alice Demo",
          }),
          created_at: new Date(now - 2 * 86400_000).toISOString() },
        ...(isWithComments
          ? [
              { id: "fa2", actor_email: ADMIN_EMAIL, action: "feedback.delete_comment",
                target_type: "feedback_comment", target_id: "c_old",
                details: JSON.stringify({
                  post_id: id,
                  author_user_id: "u_spam",
                  author_email: "spammer@example.com",
                  author_name: "Spammer",
                  body_preview: "Buy crypto on shadyexchange.example…",
                }),
                created_at: new Date(now - 3 * 86400_000).toISOString() },
            ]
          : []),
      ],
    };
  }
  if (path.startsWith("/admin/feedback")) {
    const now = Date.now();
    const rows = [
      { id: "p_bug", type: "bug",
        title: "Double-tap of right ⌘ doesn't fire the action",
        body_preview: "Steps to reproduce: 1. Map right ⌘ to Spotlight. 2. Lock the screen, then unlock. 3. Double-tap right ⌘ — nothing happens.…",
        status: "under_review",
        created_at: new Date(now - 30 * 60_000).toISOString(),
        updated_at: new Date(now - 30 * 60_000).toISOString(),
        author: { id: "u_alice", name: "Alice Demo", email: "alice@example.com" },
        vote_count: 3, comment_count: 0 },
      { id: "p_with_comments", type: "feature",
        title: "Per-app trigger overrides for Spotlight remap",
        body_preview: "I'd love to map double-tap ⇧ to Spotlight everywhere except in Xcode where it should fall back to the standard shortcut.",
        status: "planned",
        created_at: new Date(now - 6 * 86400_000).toISOString(),
        updated_at: new Date(now - 5 * 86400_000).toISOString(),
        author: { id: "u_bob", name: "Bob Tester", email: "bob@example.com" },
        vote_count: 14, comment_count: 2 },
      { id: "p_praise", type: "praise",
        title: "Switching from BetterTouchTool — DoubleTap nailed it",
        body_preview: "Tried half a dozen alternatives. None of them got the modifier-key double-tap detection right. Yours just works.",
        status: "shipped",
        created_at: new Date(now - 9 * 86400_000).toISOString(),
        updated_at: new Date(now - 9 * 86400_000).toISOString(),
        author: { id: "u_charlie", name: "Charlie Recent", email: "charlie@example.com" },
        vote_count: 6, comment_count: 0 },
      { id: "p_inprogress", type: "feature",
        title: "Add Fn+arrow keys as a trigger",
        body_preview: "Fn-arrow combos free up modifier keys for other things and would round out the Fn-key story.",
        status: "in_progress",
        created_at: new Date(now - 14 * 86400_000).toISOString(),
        updated_at: new Date(now - 2 * 86400_000).toISOString(),
        author: { id: "u_dana", name: "Dana", email: "dana@example.com" },
        vote_count: 9, comment_count: 1 },
      { id: "p_declined", type: "feature",
        title: "iOS companion app",
        body_preview: "Sync the macOS app's mappings to iOS so I can configure them on my phone.",
        status: "declined",
        created_at: new Date(now - 60 * 86400_000).toISOString(),
        updated_at: new Date(now - 45 * 86400_000).toISOString(),
        author: { id: "u_eve", name: "Eve", email: "eve@example.com" },
        vote_count: 1, comment_count: 0 },
    ];
    return { rows, page: 1, limit: 50, total: rows.length };
  }
  return undefined;
};
