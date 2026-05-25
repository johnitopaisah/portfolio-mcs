import { api } from '@/lib/api';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ProjectsSection from '@/components/ProjectsSection';
import SkillsSection from '@/components/SkillsSection';
import ExperienceSection from '@/components/ExperienceSection';
import CertificationsSection from '@/components/CertificationsSection';
import ContactSection from '@/components/ContactSection';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [profile, projects, skills, experiences, certifications, socialLinks] = await Promise.all([
    api.getProfile().catch(() => null),
    api.getProjects().catch(() => []),
    api.getSkills().catch(() => []),
    api.getExperiences().catch(() => []),
    api.getCertifications().catch(() => []),
    api.getSocialLinks().catch(() => []),
  ]);

  return (
    <>
      <Navbar />
      <main>
        <HeroSection profile={profile} />
        <ProjectsSection projects={projects} />
        <SkillsSection skills={skills} />
        <ExperienceSection experiences={experiences} />
        <CertificationsSection certifications={certifications} />
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
