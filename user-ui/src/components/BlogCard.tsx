interface BlogPost {
  id: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  medium_url: string;
  tags: string[];
  published_at: string | null;
}

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

export default function BlogCard({
  post,
  authorName,
  authorAvatarUrl,
}: {
  post: BlogPost;
  authorName?: string;
  authorAvatarUrl?: string;
}) {
  return (
    <a
      href={post.medium_url}
      target="_blank"
      rel="noopener noreferrer"
      className="card flex flex-col group overflow-hidden relative transition-all duration-300 hover:-translate-y-1"
    >
      <div className="h-44 -mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl relative">
        {post.cover_image_url ? (
          <img
            src={post.cover_image_url}
            alt={post.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.1) 0%,rgba(79,70,229,0.15) 100%)' }}>
            <span className="text-4xl opacity-60">✎</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }} />
      </div>

      {post.tags[0] && (
        <span className="text-xs font-medium px-2.5 py-0.5 rounded-full self-start mb-3"
          style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', color: '#a78bfa' }}>
          {post.tags[0]}
        </span>
      )}

      <h3 className="font-semibold text-lg mb-2 group-hover:text-violet-500 transition-colors"
        style={{ color: 'var(--text-1)' }}>
        {post.title}
      </h3>

      {post.excerpt && (
        <p className="text-sm leading-relaxed mb-4 line-clamp-3" style={{ color: 'var(--text-2)' }}>
          {post.excerpt}
        </p>
      )}

      <div className="flex items-center justify-between mt-auto pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          {authorAvatarUrl && (
            <img src={authorAvatarUrl} alt={authorName || ''} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
          )}
          {authorName && (
            <span className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{authorName}</span>
          )}
        </div>
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-4)' }}>
          {relativeDate(post.published_at)}
        </span>
      </div>
    </a>
  );
}
