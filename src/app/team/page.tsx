import { TeamHero } from '@/components/team/TeamHero';
import { TeamProfiles } from '@/components/team/TeamProfiles';
import { InvestorsSection } from '@/components/team/InvestorsSection';

export default function TeamPage() {
  return (
    <>
      <TeamHero />
      <TeamProfiles />
      <InvestorsSection />
      {/* CareersSection hidden until content is ready */}
    </>
  );
}
