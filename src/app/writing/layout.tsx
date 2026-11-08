import './writing.css';

export default function WritingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[680px] px-[22px] pt-[88px] pb-24 md:pt-[120px] md:pb-32">
      {children}
    </div>
  );
}
