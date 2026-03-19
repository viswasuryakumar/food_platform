import { useEffect, useMemo, useRef, useState } from "react";

const FOOD_IMAGE_POOL = [
  "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/2347311/pexels-photo-2347311.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/699953/pexels-photo-699953.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/1639562/pexels-photo-1639562.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/357756/pexels-photo-357756.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/725997/pexels-photo-725997.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/2233729/pexels-photo-2233729.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/70497/pexels-photo-70497.jpeg?auto=compress&cs=tinysrgb&w=1200",
];

function hashLabel(text) {
  const value = String(text || "");
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function imageForItem(name, index) {
  const seed = hashLabel(name) + index * 17;
  return FOOD_IMAGE_POOL[seed % FOOD_IMAGE_POOL.length];
}

const AUTO_ROTATION_SPEED = 5;
const AUTO_RESUME_DELAY_MS = 2200;

export default function FoodCylinderStrip({ items }) {
  const cards = useMemo(() => {
    const source = (Array.isArray(items) ? items : [])
      .filter((item) => item?.name)
      .slice(0, 14);

    if (source.length === 0) return [];

    const targetCount = Math.max(10, source.length);
    const expanded = [];
    let cursor = 0;

    while (expanded.length < targetCount) {
      const item = source[cursor % source.length];
      expanded.push({
        id: `${item.name}-${expanded.length}`,
        name: item.name,
        price: Number(item.price) || 0,
        image: imageForItem(item.name, expanded.length),
      });
      cursor += 1;
    }

    return expanded;
  }, [items]);

  const [rotation, setRotation] = useState(0);
  const draggingRef = useRef(false);
  const pointerStartXRef = useRef(0);
  const rotationStartRef = useRef(0);
  const pauseAutoUntilRef = useRef(0);

  const angleStep = cards.length > 0 ? 360 / cards.length : 0;
  const radius = Math.max(260, Math.min(420, 220 + cards.length * 12));

  useEffect(() => {
    if (cards.length <= 1) return undefined;

    let frameId = 0;
    let previousTime = performance.now();

    const animate = (now) => {
      const deltaSeconds = Math.max(0, (now - previousTime) / 1000);
      previousTime = now;

      if (!draggingRef.current && now >= pauseAutoUntilRef.current) {
        setRotation((prev) => prev + deltaSeconds * AUTO_ROTATION_SPEED);
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [cards.length]);

  function pauseAutoScroll() {
    pauseAutoUntilRef.current = performance.now() + AUTO_RESUME_DELAY_MS;
  }

  function handlePointerDown(event) {
    draggingRef.current = true;
    pointerStartXRef.current = event.clientX;
    rotationStartRef.current = rotation;
    event.currentTarget.setPointerCapture(event.pointerId);
    pauseAutoScroll();
  }

  function handlePointerMove(event) {
    if (!draggingRef.current) return;
    const deltaX = event.clientX - pointerStartXRef.current;
    setRotation(rotationStartRef.current + deltaX * 0.5);
    pauseAutoScroll();
  }

  function handlePointerUp(event) {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pauseAutoScroll();
  }

  function handleWheel(event) {
    if (cards.length <= 1) return;
    event.preventDefault();

    const delta = event.deltaY + event.deltaX;
    setRotation((prev) => prev - delta * 0.08);
    pauseAutoScroll();
  }

  if (cards.length === 0) return null;

  return (
    <section className="mb-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#8a7d6f]">
        Food Gallery
      </p>

      <div
        className="relative h-[250px] overflow-hidden rounded-2xl border border-[#eadfce] bg-gradient-to-b from-[#fff8ef] to-[#f2e7d9] md:h-[270px]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="absolute inset-x-0 top-2 bottom-0 flex items-start justify-center [perspective:1400px]">
          <div
            className="relative h-[150px] w-[200px] [transform-style:preserve-3d] md:h-[170px] md:w-[220px]"
            style={{ transform: `rotateX(-8deg) rotateY(${rotation}deg)` }}
          >
            {cards.map((card, index) => (
              <article
                key={card.id}
                className="absolute left-1/2 top-1/2 w-[165px] overflow-hidden rounded-xl border border-[#e7d9c8] bg-[#fffaf3] shadow-[0_12px_20px_rgba(41,32,24,0.18)] md:w-[185px]"
                style={{
                  transform: `translate(-50%, -50%) rotateY(${index * angleStep}deg) translateZ(${radius}px)`,
                  backfaceVisibility: "hidden",
                }}
              >
                <img src={card.image} alt={card.name} className="h-24 w-full object-cover md:h-28" />
                <div className="bg-[#fff9f2] px-2.5 py-1.5">
                  <p className="truncate text-xs font-semibold text-[#3a3128] md:text-sm">{card.name}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-6 bottom-2 h-7 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(88,67,45,0.24),rgba(88,67,45,0)_72%)] blur-md" />
      </div>

      <p className="muted mt-2 text-xs">Drag or scroll to rotate</p>
    </section>
  );
}
