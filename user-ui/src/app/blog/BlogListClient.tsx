'use client';
import { useMemo, useState } from 'react';
import BlogCard from '@/components/BlogCard';

interface BlogPost {
  id: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  medium_url: string;
  tags: string[];
  published_at: string | null;
}

export default function BlogListClient({
  posts,
  authorName,
  authorAvatarUrl,
}: {
  posts: BlogPost[];
  authorName?: string;
  authorAvatarUrl?: string;
}) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    posts.forEach(p => p.tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [posts]);

  const filtered = activeTag ? posts.filter(p => p.tags.includes(activeTag)) : posts;

  if (posts.length === 0) {
    return (
      <p className="text-center py-16" style={{ color: 'var(--text-3)' }}>
        No posts published yet — check back soon.
      </p>
    );
  }

  return (
    <div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8 mt-6">
          <button
            onClick={() => setActiveTag(null)}
            className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
            style={activeTag === null
              ? { background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#a78bfa' }
              : { border: '1px solid var(--border)', color: 'var(--text-3)' }}>
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
              style={activeTag === tag
                ? { background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#a78bfa' }
                : { border: '1px solid var(--border)', color: 'var(--text-3)' }}>
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(post => (
          <BlogCard key={post.id} post={post} authorName={authorName} authorAvatarUrl={authorAvatarUrl} />
        ))}
      </div>
    </div>
  );
}
