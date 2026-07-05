import Link from 'next/link';
import BlogCard from './BlogCard';

interface BlogPost {
  id: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  medium_url: string;
  tags: string[];
  published_at: string | null;
}

// Marquee needs at least 4 cards to look right (duplicated list fills the viewport).
// Below this count we render a simple static grid instead.
const MARQUEE_THRESHOLD  = 4;
const MAX_POSTS_IN_TEASER = 10;
const SECONDS_PER_CARD   = 6;

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default function BlogTeaserSection({
  posts,
  authorName,
  authorAvatarUrl,
}: {
  posts: BlogPost[];
  authorName?: string;
  authorAvatarUrl?: string;
}) {
  if (posts.length === 0) return null;

  const latest   = posts.slice(0, MAX_POSTS_IN_TEASER);
  const useMarquee = latest.length >= MARQUEE_THRESHOLD;
  const duration = latest.length * SECONDS_PER_CARD;

  return (
    <section id="blog" className="relative overflow-hidden">
      <div className="section relative z-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
          <div>
            <div className="section-label">Writing</div>
            <h2 className="section-title">Latest from the Blog</h2>
            <p className="section-sub">
              {posts.length} article{posts.length > 1 ? 's' : ''} · latest {relativeDate(latest[0].published_at)}
            </p>
          </div>
          <Link
            href="/blog"
            className="text-sm font-medium transition-colors flex items-center gap-1 hover:text-violet-500"
            style={{ color: 'var(--text-2)' }}>
            View all posts →
          </Link>
        </div>

        {/* Desktop / tablet ─────────────────────────────────────────────── */}
        {useMarquee ? (
          /* Marquee: 4+ posts — auto-scrolling, pauses on hover/focus */
          <div className="hidden md:block blog-marquee-wrapper relative mt-8 overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-16 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to right, var(--bg-page), transparent)' }} />
            <div className="absolute inset-y-0 right-0 w-16 z-10 pointer-events-none"
              style={{ background: 'linear-gradient(to left, var(--bg-page), transparent)' }} />
            <div
              className="blog-marquee-track flex gap-6"
              style={{ animationDuration: `${duration}s`, width: 'max-content' }}>
              {[...latest, ...latest].map((post, i) => (
                <div key={`${post.id}-${i}`} className="w-80 flex-shrink-0">
                  <BlogCard post={post} authorName={authorName} authorAvatarUrl={authorAvatarUrl} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Static grid: 1-3 posts — clean, no animation */
          <div className="hidden md:grid mt-8 gap-6"
            style={{ gridTemplateColumns: `repeat(${Math.min(latest.length, 3)}, 1fr)` }}>
            {latest.map(post => (
              <BlogCard key={post.id} post={post} authorName={authorName} authorAvatarUrl={authorAvatarUrl} />
            ))}
          </div>
        )}

        {/* Mobile — manually swipeable row, no auto-motion */}
        <div
          className="md:hidden flex gap-4 mt-8 overflow-x-auto pb-2 -mx-4 px-4"
          style={{ scrollSnapType: 'x mandatory' }}>
          {latest.map(post => (
            <div key={post.id} className="w-72 flex-shrink-0" style={{ scrollSnapAlign: 'start' }}>
              <BlogCard post={post} authorName={authorName} authorAvatarUrl={authorAvatarUrl} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
