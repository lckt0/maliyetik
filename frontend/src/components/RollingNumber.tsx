import { useEffect, useRef, useState } from 'react';

const CELL_HEIGHT_EM = 1.2;
/** 0-9 + tekrar eden fazladan '0': 9 → 0 geçişini geriye değil ileriye doğru yuvarlamak için. */
const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function RollingDigit({ digit }: { digit: number }) {
  const [index, setIndex] = useState(digit);
  const [animate, setAnimate] = useState(true);
  const prevDigit = useRef(digit);

  useEffect(() => {
    if (digit === prevDigit.current) return;
    // Basamak 9'dan 0'a sarıyorsa (ör. 19 → 20), şeritteki gerçek 0'a değil, sondaki fazladan
    // 0 kopyasına kaydırılır — böylece rakam geriye değil ileriye doğru yuvarlanmış görünür.
    setIndex(prevDigit.current === 9 && digit === 0 ? 10 : digit);
    setAnimate(true);
    prevDigit.current = digit;
  }, [digit]);

  function handleTransitionEnd() {
    if (index === 10) {
      setAnimate(false);
      setIndex(0);
    }
  }

  return (
    <span className="rolling-digit">
      <span
        className="rolling-digit-strip"
        style={{
          transform: `translateY(-${index * CELL_HEIGHT_EM}em)`,
          transition: animate ? 'transform .5s cubic-bezier(.34,1.15,.44,1)' : 'none',
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {STRIP.map((d, i) => <span key={i} className="rolling-digit-cell">{d}</span>)}
      </span>
    </span>
  );
}

/** Sayının her hanesini ayrı ayrı yuvarlayarak (odometre efekti) gösterir; ayraçlar (nokta/virgül) sabit kalır. */
export function RollingNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const chars = format(value).split('');
  return (
    <span className="rolling-number">
      {chars.map((ch, i) => {
        const posFromRight = chars.length - 1 - i;
        return /[0-9]/.test(ch)
          ? <RollingDigit key={posFromRight} digit={Number(ch)} />
          : <span key={posFromRight} className="rolling-separator">{ch}</span>;
      })}
    </span>
  );
}
