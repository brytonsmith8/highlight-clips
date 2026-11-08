import Image from "next/image";

/**
 * The real BRYT VISION logo as a 3D coin. Pure CSS (see `.coin*` in
 * globals.css): both faces use the supplied logo image unmodified, and a
 * stack of thin red discs forms the coin's edge. It holds on the front face,
 * then turns a full revolution. With prefers-reduced-motion it stays still.
 */
const RIM_SLICES = [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6];

export function CoinLogo() {
  return (
    <div
      className="coin-scene"
      role="img"
      aria-label="BRYT VISION logo"
    >
      <div className="coin-glow" aria-hidden="true" />
      <div className="coin-float">
        <div className="coin" aria-hidden="true">
          {RIM_SLICES.map((z) => (
            <div
              key={z}
              className="coin-rim"
              style={{ transform: `translateZ(${z}px)` }}
            />
          ))}
          <div className="coin-face coin-front">
            <Image
              src="/brand/bryt-vision-logo-hero.png"
              alt=""
              fill
              priority
              sizes="(min-width: 768px) 380px, 80vw"
              className="object-contain"
            />
          </div>
          <div className="coin-face coin-back">
            <Image
              src="/brand/bryt-vision-logo-hero.png"
              alt=""
              fill
              sizes="(min-width: 768px) 380px, 80vw"
              className="object-contain"
            />
          </div>
        </div>
      </div>
      <div className="coin-shadow" aria-hidden="true" />
    </div>
  );
}
