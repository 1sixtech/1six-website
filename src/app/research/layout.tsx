import './research.css';

export default function ResearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[680px] px-[22px] pt-[88px] pb-28 md:pt-[120px] md:pb-36">
      {children}
    </div>
  );
}
