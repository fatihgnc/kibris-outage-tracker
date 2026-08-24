// Structured data (§7.6). Server-rendered from our own dictionaries and
// content files, never from anything a source publishes.
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // `<` is escaped so a stray "</script" inside a title or a place name
      // cannot close the element early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\u003c') }}
    />
  );
}
