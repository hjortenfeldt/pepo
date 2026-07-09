"use client";

import Icon from "@/components/Icon";
import ShareIosIcon from "./ShareIosIcon";

export type Platform =
  | "ios-safari"
  | "ios-other"
  | "android-chrome"
  | "android-samsung"
  | "android-other"
  | "desktop-chrome"
  | "desktop-other";

type Pointer = "bottom-center" | "top-right" | "none";

type GuideContent = {
  heading: string;
  intro?: string;
  steps: React.ReactNode[];
  pointer: Pointer;
  pointerIcon: string;
};

const CLOSING_STEP = "Luk derefter denne side og åbn Pepo-appen via app-ikonet på din hjemmeskærm.";

// Ikonet er indsat direkte i teksten (i stedet for kun som pegepil), fordi en
// pegende animation nederst på skærmen viste sig forvirrende på iPhone —
// brugere troede de kunne trykke på selve pilen/ikonet oven på siden.
//
// ShareIosIcon (håndtegnet, se ShareIosIcon.tsx) bruges i stedet for et
// Tabler-ikon, da hverken deres "share" (tre cirkler forbundet af streger)
// eller "square-arrow-up" (lukket firkant med pil indeni) matcher Apples
// rigtige Del-ikon — en kasse med åben top og en pil op igennem åbningen.
const SHARE_ICON_INLINE = (
  <ShareIosIcon size={15} className="inline-block align-[-2px] mx-0.5 text-pepo-p" strokeWidth={1.75} />
);

const CONTENT: Record<Platform, GuideContent> = {
  "ios-safari": {
    heading: "Sådan installerer du Pepo på din iPhone",
    steps: [
      <>Tryk på &quot;{SHARE_ICON_INLINE}Del&quot;.</>,
      <>Scroll ned i menuen og vælg &quot;Føj til hjemmeskærm&quot;.</>,
      <>Bekræft ved at trykke &quot;Tilføj&quot; øverst til højre.</>,
      CLOSING_STEP,
    ],
    pointer: "none",
    pointerIcon: "share-ios",
  },
  "ios-other": {
    heading: "Sådan installerer du Pepo",
    intro: "Din browser bruger Safaris motor under motorhjelmen, så installation foregår via Del-ikonet.",
    steps: [
      "Tryk på Del-ikonet i browserens værktøjslinje.",
      'Find og tryk på "Føj til hjemmeskærm".',
      'Bekræft ved at trykke "Tilføj".',
      CLOSING_STEP,
    ],
    pointer: "top-right",
    pointerIcon: "share-ios",
  },
  "android-chrome": {
    heading: "Sådan installerer du Pepo på din Android-telefon",
    steps: [
      "Tryk på de tre prikker (⋮) øverst til højre i Chrome.",
      'Vælg "Installer app" (eller "Føj til startskærm").',
      'Bekræft ved at trykke "Installer".',
      CLOSING_STEP,
    ],
    pointer: "top-right",
    pointerIcon: "dots-vertical",
  },
  "android-samsung": {
    heading: "Sådan installerer du Pepo på din Android-telefon",
    steps: [
      "Tryk på menu-ikonet nederst til højre i Samsung Internet.",
      'Vælg "Føj side til" og derefter "Startskærm".',
      'Bekræft ved at trykke "Tilføj".',
      CLOSING_STEP,
    ],
    pointer: "none",
    pointerIcon: "dots-vertical",
  },
  "android-other": {
    heading: "Sådan installerer du Pepo",
    steps: [
      "Åbn browserens menu (tre prikker eller streger).",
      'Vælg "Installer" eller "Føj til startskærm".',
      "Bekræft installationen.",
      CLOSING_STEP,
    ],
    pointer: "top-right",
    pointerIcon: "dots-vertical",
  },
  "desktop-chrome": {
    heading: "Sådan installerer du Pepo på computeren",
    steps: [
      "Klik på installations-ikonet i adresselinjen (et lille skærmikon med en pil).",
      'Klik "Installer" i vinduet, der popper op.',
      "Pepo åbner nu som sit eget vindue — brug det fremover i stedet for denne fane.",
    ],
    pointer: "none",
    pointerIcon: "download",
  },
  "desktop-other": {
    heading: "Pepo er lavet til din telefon",
    intro:
      "Din nuværende browser understøtter ikke installation direkte. Åbn dette link på din mobil (Safari på iPhone eller Chrome på Android) for at installere Pepo som app.",
    steps: [],
    pointer: "none",
    pointerIcon: "device-mobile",
  },
};

// "share-ios" er ikke et Tabler-ikonnavn — det er vores håndtegnede
// ShareIosIcon (se kommentar ved SHARE_ICON_INLINE ovenfor).
function PointerIcon({ name, size }: { name: string; size: number }) {
  if (name === "share-ios") {
    return <ShareIosIcon size={size} className="text-pepo-p" strokeWidth={1.75} />;
  }
  return <Icon name={name} size={size} className="text-pepo-p" strokeWidth={1.75} />;
}

export default function InstallGuide({
  platform,
  onSkip,
  nativeInstall,
}: {
  platform: Platform;
  onSkip: () => void;
  nativeInstall?: () => void;
}) {
  const content = CONTENT[platform];

  return (
    <div className="min-h-screen flex flex-col bg-pepo-su relative overflow-hidden">
      {content.pointer === "bottom-center" && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pepo-point-down z-10">
          <PointerIcon name={content.pointerIcon} size={30} />
        </div>
      )}
      {content.pointer === "top-right" && (
        <div className="fixed top-3 right-3 flex flex-col items-end gap-1 pepo-point-up z-10">
          <PointerIcon name={content.pointerIcon} size={28} />
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
        <div className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pepo-logo.svg" alt="Pepo" className="w-[120px] h-[120px] flex-shrink-0" />
        </div>

        <div className="w-full max-w-[380px] bg-pepo-wh rounded-[20px] p-7 shadow-[0_4px_32px_rgba(62,31,138,0.10)] pepo-rise text-left">
          <div className="text-[19px] font-semibold text-pepo-t1 tracking-tight mb-1">
            {content.heading}
          </div>
          {content.intro && <div className="text-[13.5px] text-pepo-t2 mb-4">{content.intro}</div>}

          {content.steps.length > 0 && (
            <ol className="flex flex-col gap-3 mt-4">
              {content.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-pepo-pl text-pepo-p text-[13px] font-semibold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-[14px] text-pepo-t1 leading-snug pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          )}

          {nativeInstall && (
            <button
              type="button"
              onClick={nativeInstall}
              className="w-full h-[46px] mt-6 rounded-[10px] text-[15px] font-medium bg-pepo-p text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
            >
              <Icon name="download" size={18} className="text-white" strokeWidth={1.75} />
              Installér Pepo-app
            </button>
          )}

          <button
            type="button"
            onClick={onSkip}
            className="w-full h-9 mt-4 text-[13px] font-medium text-pepo-t2 hover:text-pepo-t1 transition-colors"
          >
            Fortsæt uden at installere
          </button>
        </div>
      </div>
    </div>
  );
}
