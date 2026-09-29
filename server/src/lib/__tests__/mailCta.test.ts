import { describe, expect, it } from 'vitest';
import { dataRequestMailButtonsHtml, mailCtaButton, mailCtaRow } from '../mailCta.js';

describe('mail CTA buttons', () => {
  it('renders a styled button', () => {
    const html = mailCtaButton('https://app.test/portal', 'Open portal');
    expect(html).toContain('href="https://app.test/portal"');
    expect(html).toContain('>Open portal<');
    expect(html).toContain('display:inline-block');
  });

  it('builds data-request portal + engagement buttons', () => {
    const html = dataRequestMailButtonsHtml({ engagementId: 'eng-1' });
    expect(html).toContain('Open client portal');
    expect(html).toContain('View engagement');
    expect(html).toContain('/client/dashboard');
    expect(html).toContain('/engagements/eng-1');
  });

  it('rows join multiple buttons', () => {
    const html = mailCtaRow([
      { href: 'https://a.test/x', label: 'A' },
      { href: 'https://a.test/y', label: 'B', bg: '#16a34a' },
    ]);
    expect(html).toContain('>A<');
    expect(html).toContain('>B<');
  });
});
