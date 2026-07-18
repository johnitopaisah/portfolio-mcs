import { api } from '@/lib/api';
import Navbar from '@/components/Navbar';
import BlogListClient from './BlogListClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Blog',
  description: 'Articles on DevOps, cloud, and Kubernetes engineering.',
};

export default async function BlogPage() {
  const [profile, posts] = await Promise.all([
    api.getProfile().catch(() => null),
    api.getBlogPosts().catch(() => []),
  ]);

  return (
    <>
      <Navbar availabilityStatus={profile?.availability_status} />
      <main className="min-h-screen pt-16">
        <div className="section">
          <div className="section-label">Writing</div>
          <h1 className="section-title">Blog</h1>
          <p className="section-sub">
            Articles I&apos;ve published on Medium, on DevOps, cloud, and Kubernetes engineering.
          </p>

          <BlogListClient
            posts={posts}
            authorName={profile?.name}
            authorAvatarUrl={profile ? api.avatarUrl : undefined}
          />
        </div>
      </main>
    </>
  );
}
