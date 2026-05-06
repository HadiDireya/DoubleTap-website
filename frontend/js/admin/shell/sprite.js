// Loads the Lucide-derived icon sprite once at boot and prepends it to
// <body> so any subsequent `<use href="#i-…">` resolves. Cached aggressively
// (force-cache); the sprite never changes between deploys without a rename.

export const loadSprite = async () => {
  const res = await fetch("/assets/admin-icons.svg", { cache: "force-cache" });
  if (!res.ok) return;
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg && svg.tagName.toLowerCase() === "svg") {
    document.body.prepend(svg);
  }
};
