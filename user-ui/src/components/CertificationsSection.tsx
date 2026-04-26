import { api } from '@/lib/api';

interface Cert {
  id: string; name: string; issuer: string; issue_date: string;
  expiry_date?: string; credential_url?: string; has_image: boolean;
}

// Parse ISO date directly — avoids new Date('YYYY-MM-DD') UTC shift
function formatDate(d: string) {
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

type AccentKey = 'aws' | 'cncf' | 'google' | 'microsoft' | 'default';

const ACCENT: Record<AccentKey, { card: string; icon: string; text: string; verify: string }> = {
  aws:       { card: 'hover:border-yellow-500/40',  icon: 'bg-yellow-500/10 border-yellow-500/30',  text: 'text-yellow-400', verify: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20' },
  cncf:      { card: 'hover:border-cyan-500/40',    icon: 'bg-cyan-500/10 border-cyan-500/30',      text: 'text-cyan-400',   verify: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20' },
  google:    { card: 'hover:border-blue-500/40',    icon: 'bg-blue-500/10 border-blue-500/30',      text: 'text-blue-400',   verify: 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20' },
  microsoft: { card: 'hover:border-violet-500/40',  icon: 'bg-violet-500/10 border-violet-500/30',  text: 'text-violet-400', verify: 'bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20' },
  default:   { card: 'hover:border-violet-500/40',  icon: 'bg-violet-500/10 border-violet-500/30',  text: 'text-violet-400', verify: 'bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20' },
};

function getAccent(issuer: string): AccentKey {
  const i = issuer.toLowerCase();
  if (i.includes('aws') || i.includes('amazon'))       return 'aws';
  if (i.includes('cncf') || i.includes('linux'))       return 'cncf';
  if (i.includes('google'))                            return 'google';
  if (i.includes('microsoft') || i.includes('azure')) return 'microsoft';
  return 'default';
}

export default function CertificationsSection({ certifications }: { certifications: Cert[] }) {
  if (!certifications.length) return null;

  return (
    <section id="certifications" className="relative overflow-hidden">
      <div className="absolute top-0 right-1/4 w-96 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)' }}
        aria-hidden />

      <div className="section relative z-10">
        <div className="section-label">Credentials</div>
        <h2 className="section-title">Certifications</h2>
        <p className="section-sub">Achievements &amp; badges</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {certifications.map(cert => {
            const key    = getAccent(cert.issuer);
            const accent = ACCENT[key];
            const isValid = !cert.expiry_date || new Date(cert.expiry_date) > new Date();

            return (
              <div key={cert.id}
                className={`group flex flex-col items-center text-center p-5 rounded-2xl
                  transition-all duration-300 hover:-translate-y-1 cursor-default
                  border ${accent.card}`}
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-card)',
                }}>

                {/* Badge */}
                <div className="mb-3 relative">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden border ${accent.icon}`}>
                    {cert.has_image ? (
                      <img src={api.certImageUrl(cert.id)} alt={cert.name}
                        className="w-12 h-12 object-contain" />
                    ) : (
                      <span className="text-2xl">🏅</span>
                    )}
                  </div>
                  {/* Valid tick — border uses CSS var so it blends on light mode */}
                  {isValid && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center"
                      style={{ border: '2px solid var(--bg-page)' }}>
                      <span style={{ fontSize: '8px', color: '#fff', lineHeight: 1 }}>✓</span>
                    </div>
                  )}
                </div>

                <h3 className="font-semibold text-sm leading-snug mb-1 line-clamp-2"
                  style={{ color: 'var(--text-1)' }}>
                  {cert.name}
                </h3>
                <p className={`text-xs font-medium mb-2 ${accent.text}`}>{cert.issuer}</p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {formatDate(cert.issue_date)}
                  {cert.expiry_date ? ` → ${formatDate(cert.expiry_date)}` : ''}
                </p>

                {cert.credential_url && (
                  <a href={cert.credential_url} target="_blank" rel="noopener noreferrer"
                    className={`mt-3 text-xs px-3 py-1 rounded-full border transition-colors ${accent.verify}`}>
                    Verify ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
