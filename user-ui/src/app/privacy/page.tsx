import { api } from '@/lib/api';
import Navbar from '@/components/Navbar';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Privacy',
  description: 'What this site records, why, for how long, and your rights.',
};

// Privacy contact — the professional address, independent of the profile email.
const CONTACT = 'connect@johnisah.com';
const UPDATED = '23 November 2026';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

const Mail = () => <a href={`mailto:${CONTACT}`} className="underline hover:text-violet-400">{CONTACT}</a>;

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
            This is a personal portfolio. Data is used only to run the site, answer you, and understand
            how the site is used. It is never sold, never used for advertising, and there are no
            tracking cookies.
          </p>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
            <Section id="who" title="Who is responsible">
              <p>
                John Itopa ISAH, the owner of this site, is responsible for the data described here
                (the &ldquo;data controller&rdquo;). Contact: <Mail />.
              </p>
            </Section>

            <Section id="visits" title="Visits to the site">
              <p>
                Each visit to the homepage records the time, your approximate location (country, region
                and city, as provided by Cloudflare), browser, operating system, device type, language, and
                the website you came from (the site name only, not the full address). Your IP address is
                <strong> not stored</strong>. It is used once to create an anonymous code that changes every
                day, which counts unique visitors without following anyone from one day to the next.
                No cookie is used for this.
              </p>
              <p>
                Why: to understand how the site is used (legitimate interest). How long: individual visits
                are kept for 13 months, then only daily totals remain.
              </p>
            </Section>

            <Section id="blog" title="Clicks on blog posts">
              <p>
                Blog links pass through this site on their way to Medium. Each click records the post, the
                time, your approximate location, browser, operating system, device type, language and how
                you reached the site, using the same anonymous daily code — never your IP address.
                Individual clicks are deleted after 90 days; only daily totals per post are kept. Post images
                are served from this site, so Medium is not contacted until you open a post — from then on,
                Medium&apos;s own privacy policy applies.
              </p>
            </Section>

            <Section id="cv-requests" title="CV requests">
              <p>
                The CV is sent by email. When you request it, the site stores your email address, the
                language you chose, the time, your approximate location (country, region, city), browser,
                operating system, device type and how you reached the site — plus your name, company and
                role if you chose to give them. John is notified so he knows who received his CV and may
                contact you about opportunities. Your IP address is not stored; an anonymous code derived
                from it is used only to prevent abuse.
              </p>
              <p>
                Why: you asked for the CV and agreed to this (consent — you can withdraw it at any time).
                How long: name, company and role are deleted after 90 days; after 12 months the email and
                city are deleted too, leaving only anonymous totals (country, language, date).
              </p>
            </Section>

            <Section id="contact" title="Contact form">
              <p>
                Messages sent through the contact form (your name, email, subject and message) are stored so
                John can reply. John is alerted by email and by a short text message containing your name,
                email and subject.
              </p>
              <p>
                Why: to answer your message (legitimate interest / your request). How long: messages are
                deleted after 12 months.
              </p>
            </Section>

            <Section id="referees" title="Referees and reference requests">
              <p>
                <strong>Referees.</strong> People who write a reference for John submit it themselves through a
                private invitation link. Their name, title, organisation, relationship, review, photo and
                LinkedIn link are published on this site with their agreement. Their email and phone are
                <strong> never published</strong>. A referee can ask at any time for their reference to be
                changed or removed; it is then deleted.
              </p>
              <p>
                <strong>Asking to contact a referee.</strong> If you request a referee&apos;s contact details,
                the site stores your name, email, company, LinkedIn link (optional), purpose and message, and
                sends you a link to confirm your email. John reviews the request. If he approves it, your
                details are shared with the referee, who decides whether to share their contact details with
                you — nothing is shared without the referee&apos;s agreement.
              </p>
              <p>
                Why: your request and the referee&apos;s consent. How long: requests are deleted 12 months after
                they are completed, declined or expired.
              </p>
            </Section>

            <Section id="recruiters" title="If you contact me about a job">
              <p>
                Emails and contact details from recruiters and employers about John&apos;s job applications are
                kept to manage his job search. Incoming emails are sorted automatically, which includes sending
                their content to an AI service (Anthropic). Follow-up emails to you are only sent after John
                has reviewed them. This information is not published or shared.
              </p>
              <p>
                Why: managing job applications (legitimate interest). How long: 12 months after the
                application is closed, then the emails are anonymised and contact details deleted.
              </p>
            </Section>

            <Section id="cookies" title="Cookies and browser storage">
              <p>
                This site sets <strong>no tracking or advertising cookies</strong>. If you switch between the
                light and purple themes, your choice is saved in your own browser (local storage) and never
                sent to the server. Fonts and images are served from this site, not from Google or Medium.
                Cloudflare may set a strictly necessary security cookie to protect the site from abuse.
              </p>
            </Section>

            <Section id="services" title="Service providers">
              <p>These providers process data on the site&apos;s behalf, only for the purposes above:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Cloudflare</strong> — delivers and protects the site, and provides approximate location.</li>
                <li><strong>Zoho Mail</strong> (EU) — sends and receives email, including the CV emails.</li>
                <li><strong>Twilio</strong> — text-message alerts for contact-form messages.</li>
                <li><strong>Google Cloud</strong> — encrypted database backups, kept for 14 days.</li>
                <li><strong>Anthropic</strong> — automated sorting of job-related emails.</li>
              </ul>
              <p>
                Some of these providers are based outside the EU (mainly in the United States); transfers
                rely on the safeguards they offer, such as the European Commission&apos;s standard contractual
                clauses or the EU–US Data Privacy Framework.
              </p>
            </Section>

            <Section id="security" title="Security and technical logs">
              <p>
                The site uses HTTPS and only John can access the data. To keep the site running and secure,
                the servers keep short technical logs of requests (including IP address and browser), which
                are overwritten within a few days. Anonymous page-speed measurements and error counts are
                collected without any identifier. Sign-in attempts to the site&apos;s private admin area are
                kept for 90 days to block break-in attempts. Because backups are kept for 14 days, deleted
                data disappears from backups within 14 days.
              </p>
            </Section>

            <Section id="rights" title="Your rights">
              <p>
                You can ask to see the data held about you, to correct it, to have it deleted, to restrict or
                object to its use, or to receive a copy, and you can withdraw your consent at any time. Email{' '}
                <Mail />; you will get an answer within one month. You can also complain to the French data
                protection authority, the{' '}
                <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="underline hover:text-violet-400">CNIL</a>,
                or to the authority in your own country.
              </p>
              <p>No decisions with legal or similar effects are made about you automatically.</p>
            </Section>

            <p className="text-xs pt-2" style={{ color: 'var(--text-3)' }}>Last updated {UPDATED}.</p>
          </div>
        </div>
      </main>
    </>
  );
}
