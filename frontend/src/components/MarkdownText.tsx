import { Fragment, ReactNode } from 'react';

/**
 * Yapay zeka metinleri için küçük Markdown gösterici.
 *
 * Model çıktısı Markdown işaretlemesi içeriyor (`**Durum Özeti:**`, `* madde`) ama düz
 * metin olarak basılıyordu; kullanıcı yıldızları olduğu gibi görüyordu. Prompt'a
 * "Markdown kullanma" demek yerine göstermeyi düzeltmek doğru olan: liste ve vurgu,
 * özetin okunabilirliğinin asıl taşıyıcısı.
 *
 * Hazır bir kütüphane YERİNE bu: desteklenen söz dizimi bir avuç ve çıktı React
 * düğümü olarak kuruluyor — `dangerouslySetInnerHTML` hiç kullanılmıyor, dolayısıyla
 * model çıktısının sayfaya işaretleme enjekte etmesi mümkün değil.
 *
 * Desteklenen: **kalın**, *eğik*, _eğik_, `kod`, "- / * / •" madde listesi,
 * "1." numaralı liste, "#" başlık, boş satırla ayrılmış paragraflar.
 */

/**
 * Satır içi vurguları React düğümlerine çevirir.
 *
 * Tek büyük bir regex yerine elle tarama: "önce en uzun işaret" sırasını (** > * )
 * doğal olarak verir ve LOOKBEHIND gerektirmez. Lookbehind Safari 16.4'ten önce
 * desteklenmiyor ve desteklenmediğinde modül AYRIŞTIRMA anında SyntaxError atıyor —
 * yani tüm chunk çöküp bu dosyanın düzeltmeye çalıştığı boş ekranı üretiyordu.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  let k = 0;
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  const isWord = (ch: string | undefined) => !!ch && /[\w\u00C0-\u024F]/.test(ch);

  while (i < text.length) {
    const rest = text.slice(i);

    const bold = /^\*\*([^*]+)\*\*/.exec(rest);
    if (bold) {
      flush();
      out.push(<strong key={`${keyPrefix}-${k++}`}>{bold[1]}</strong>);
      i += bold[0].length;
      continue;
    }

    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push(<code key={`${keyPrefix}-${k++}`}>{code[1]}</code>);
      i += code[0].length;
      continue;
    }

    // Kelime ortasındaki alt çizgi vurgu SAYILMAZ: `quota_from_plan` gibi tanımlayıcılar
    // eğik yazıya dönüşmesin.
    const em = /^([*_])([^*_\n]+)\1/.exec(rest);
    if (em && !(em[1] === '_' && isWord(text[i - 1]))) {
      flush();
      out.push(<em key={`${keyPrefix}-${k++}`}>{em[2]}</em>);
      i += em[0].length;
      continue;
    }

    buf += text[i];
    i += 1;
  }
  flush();
  return out;
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'h'; text: string };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const prev = blocks[blocks.length - 1];

    if (!line.trim()) {
      // Boş satır yalnızca AÇIK bloğu kapatır; ardışık boşluklar boş paragraf üretmez.
      if (prev && prev.kind === 'p' && prev.lines.length) blocks.push({ kind: 'p', lines: [] });
      else if (prev && prev.kind !== 'p') blocks.push({ kind: 'p', lines: [] });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) { blocks.push({ kind: 'h', text: heading[1] }); continue; }

    const bullet = BULLET.exec(line);
    if (bullet) {
      if (prev?.kind === 'ul') prev.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      if (prev?.kind === 'ol') prev.items.push(numbered[1]);
      else blocks.push({ kind: 'ol', items: [numbered[1]] });
      continue;
    }

    if (prev?.kind === 'p') prev.lines.push(line);
    else blocks.push({ kind: 'p', lines: [line] });
  }
  return blocks.filter((b) => b.kind !== 'p' || b.lines.length > 0);
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text ?? '');
  return (
    <div className={`md${className ? ` ${className}` : ''}`}>
      {blocks.map((b, bi) => {
        if (b.kind === 'h') return <p key={bi} className="md-h">{renderInline(b.text, `b${bi}`)}</p>;
        if (b.kind === 'ul' || b.kind === 'ol') {
          const List = b.kind === 'ul' ? 'ul' : 'ol';
          return (
            <List key={bi} className="md-list">
              {b.items.map((item, ii) => <li key={ii}>{renderInline(item, `b${bi}-${ii}`)}</li>)}
            </List>
          );
        }
        return (
          <p key={bi}>
            {b.lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, `b${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
