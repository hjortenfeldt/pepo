/**
 * Apples rigtige "Del"-ikon (SF Symbol "square.and.arrow.up") — en kasse med
 * åben top, og en pil der peger op igennem åbningen. Findes ikke i Tabler-
 * ikonsættet (deres "share" er tre cirkler forbundet af streger, og deres
 * "square-arrow-up" er en helt lukket firkant med en pil inden i — begge
 * forveksler brugere på iPhone, som er vant til det rigtige Del-ikon).
 *
 * Markuppet her er identisk med public/icons/share-ios.svg, men indlejret
 * direkte som JSX (i stedet for <img src="...">), så det kan farves med
 * currentColor/className ligesom komponenten i components/Icon.tsx.
 */
export default function ShareIosIcon({
  size = 18,
  className,
  strokeWidth = 2,
}: {
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 16V4" />
      <path d="M7 8l5-5 5 5" />
      <path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}
