import { api } from '@/lib/api';
import Navbar from '@/components/Navbar';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Privacy',
  description: 'What this site records about visits, and why.',
};

export default async function PrivacyPage() {
  const profile = await api.getProfile().catch(() => null);

  return (
    <>
      <Navbar availabilityStatus={profile?.availability_status} />
      <main className="min-h-screen pt-16">
        <div className="section max-w-3xl">
          <div className="section-label">Privacy</div>
          <h1 className="section-title">What this site records</h1>
          <p className="section-sub">
            This is a personal portfolio. Visit data is used only to understand how the site is
            used. It is not sold, shared for advertising, or used to identify you.
          </p>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
            <section>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Visits to the homepage</h2>
              <p>
                Each homepage visit records your IP address, approximate location, browser, operating
                system, device type, language and the site you came from. A cookie
                (<code>portfolio-sid</code>) groups page loads into one visit; it expires after 30 minutes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Clicks on blog posts</h2>
              <p>
                Blog links pass through this site on their way to Medium. Each click records the post,
                the time, your approximate location, browser, operating system, device type, language
                and how you reached the site. Your IP address is not stored with the click. It is used
                once to look up the location and to create an anonymous code that changes every day,
                which counts unique visitors without following anyone from one day to the next.
                Individual clicks are deleted after 90 days; only daily totals per post are kept.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Other services</h2>
              <p>
                Traffic passes through Cloudflare, and IP addresses are sent to ip-api.com to look up
                approximate location. Once you are on Medium, Medium&apos;s own privacy policy applies.
              </p>
            </section>

            {profile?.email && (
              <section>
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Questions</h2>
                <p>
                  To ask about your data or have it removed, email{' '}
                  <a href={`mailto:${profile.email}`} className="underline hover:text-violet-400">{profile.email}</a>.
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
