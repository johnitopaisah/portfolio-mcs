import { api } from '@/lib/api';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ProjectsSection from '@/components/ProjectsSection';
import SkillsSection from '@/components/SkillsSection';
import ExperienceSection from '@/components/ExperienceSection';
import EducationSection from '@/components/EducationSection';
import CertificationsSection from '@/components/CertificationsSection';
import RefereesSection from '@/components/RefereesSection';
import ContactSection from '@/components/ContactSection';
import BlogTeaserSection from '@/components/BlogTeaserSection';
import BackendStatusSeed from '@/components/BackendStatusSeed';

export const dynamic = 'force-dynamic';

function unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export default async function HomePage() {
  const results = await Promise.allSettled([
    api.getProfile(),
    api.getProjects(),
    api.getSkills(),
    api.getExperiences(),
    api.getEducation(),
    api.getCertifications(),
    api.getReferies(),
    api.getSocialLinks(),
    api.getBlogPosts(),
  ]);

  // A real backend can't legitimately fail all 9 different endpoints at
  // once — this is the signal that the API/DB is unreachable, not just
  // one broken query. Seeds MaintenanceOverlay so a fresh page load
  // during an outage shows the overlay immediately instead of a flash of
  // this page's empty/broken-looking fallback content below.
  const allFailed = results.every((r) => r.status === 'rejected');

  const [profileR, projectsR, skillsR, experiencesR, educationR, certificationsR, refereesR, socialLinksR, blogPostsR] = results;
  const profile = unwrap(profileR, null);
  const projects = unwrap(projectsR, []);
  const skills = unwrap(skillsR, []);
  const experiences = unwrap(experiencesR, []);
  const education = unwrap(educationR, []);
  const certifications = unwrap(certificationsR, []);
  const referees = unwrap(refereesR, []);
  const socialLinks = unwrap(socialLinksR, []);
  const blogPosts = unwrap(blogPostsR, []);

  return (
    <>
      <BackendStatusSeed down={allFailed} />
      <Navbar availabilityStatus={profile?.availability_status} />
      <main>
        <HeroSection profile={profile} certifications={certifications} />

        <BlogTeaserSection
          posts={blogPosts}
          authorName={profile?.name}
          authorAvatarUrl={profile ? api.avatarUrl : undefined}
        />

        <ProjectsSection projects={projects} />
        <SkillsSection skills={skills} />
        <ExperienceSection experiences={experiences} />
        <EducationSection education={education} />
        <CertificationsSection certifications={certifications} />
        <RefereesSection referees={referees} />
        <ContactSection socialLinks={socialLinks} />
      </main>

      <footer className="py-10 mt-8" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            © {new Date().getFullYear()} John Itopa ISAH
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-4)' }}>
            Built with Next.js · Deployed on Kubernetes
          </p>
          <div className="flex gap-5">
            {[
              { label: 'GitHub',   href: profile?.github_url   || '#' },
              { label: 'LinkedIn', href: profile?.linkedin_url || '#' },
            ].map(l => (
              <a key={l.label} href={l.href}
                target={l.href !== '#' ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="text-sm transition-colors hover:text-violet-400"
                style={{ color: 'var(--text-3)' }}>
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
