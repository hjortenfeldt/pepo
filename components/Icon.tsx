import type { ComponentType } from "react";
import * as TablerIcons from "@tabler/icons-react";
import type { IconProps } from "@tabler/icons-react";

// Samme ikonsæt som prototyperne (Tabler, "outline"-stil), men her som rigtige
// SVG-komponenter fra @tabler/icons-react i stedet for en håndholdt SVG-blob
// (prototypernes "pepo-icons.js") — så vi får hele Tabler-bibliotekets ikoner
// uden selv at skulle vedligeholde SVG-data, og med samme visuelle resultat:
// ægte SVG i DOM'en (ikke en webfont hentet fra et CDN ved sideindlæsning).
//
// Ikonnavne skrives kebab-case, ligesom i prototyperne (fx "layout-dashboard",
// "building-store") — komponenten konverterer selv til Tabler-komponentnavnet
// (fx IconLayoutDashboard, IconBuildingStore).
function toComponentName(name: string): string {
  const pascal = name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `Icon${pascal}`;
}

export default function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 1,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const componentName = toComponentName(name);
  const Component = (TablerIcons as unknown as Record<string, ComponentType<IconProps> | undefined>)[
    componentName
  ];

  if (!Component) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Icon: ukendt ikon "${name}" (forventede Tabler-komponent ${componentName})`);
    }
    return null;
  }

  return <Component size={size} className={className} stroke={strokeWidth} />;
}
