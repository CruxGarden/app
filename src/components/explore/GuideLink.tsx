import { openFieldGuide, type GuidePage } from '@/stores/fieldGuide';
export default function GuideLink({
  page,
  children,
}: {
  page: GuidePage;
  children: React.ReactNode;
}) {
  return (
    <button className="text-xs text-accent hover:underline" onClick={() => openFieldGuide(page)}>
      {children}
    </button>
  );
}
