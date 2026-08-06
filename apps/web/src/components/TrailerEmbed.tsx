// The film page's trailer slot: the shared click-to-load frame, under the
// section head every film-page module carries.
import { SectionHead } from "./ReelDivider";
import { VideoEmbed } from "./VideoEmbed";

export function TrailerEmbed({ youtubeKey, title }: { youtubeKey: string; title: string }) {
  return (
    <section aria-label="Trailer">
      <SectionHead>Trailer</SectionHead>
      <div className="mt-3">
        <VideoEmbed youtubeKey={youtubeKey} title={`${title} trailer`} />
      </div>
    </section>
  );
}
