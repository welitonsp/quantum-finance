import { useEffect, useRef } from 'react';

export default function QuantumBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    if (!canvas) return;
    const canvasEl: HTMLCanvasElement = canvas;

    const ctx = canvasEl.getContext('2d')!;
    let animationFrameId: number;
    let mouseX = 0, mouseY = 0;
    let isVisible = !document.hidden;

    const isMobile = window.innerWidth < 768;
    const PARTICLE_COUNT = isMobile ? 30 : 80;
    const CONNECTION_DISTANCE = isMobile ? 80 : 120;

    const resizeCanvas = () => { canvasEl.width = window.innerWidth; canvasEl.height = window.innerHeight; };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const handleMouseMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY; };
    if (!isMobile) window.addEventListener('mousemove', handleMouseMove);

    class Particle {
      x = 0; y = 0; size = 0; speedX = 0; speedY = 0; opacity = 0; hue = 0;
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvasEl.width;
        this.y = Math.random() * canvasEl.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.4;
        this.speedY = (Math.random() - 0.5) * 0.4;
        this.opacity = Math.random() * 0.5 + 0.1;
        this.hue = Math.random() > 0.7 ? 270 : 155;
      }
      update() {
        this.x += this.speedX; this.y += this.speedY;
        if (!isMobile) {
          const dx = mouseX - this.x, dy = mouseY - this.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 200) { this.x += dx*0.0005; this.y += dy*0.0005; this.opacity = Math.min(0.8, this.opacity+0.01); }
          else { this.opacity = Math.max(0.1, this.opacity-0.005); }
        }
        if (this.x < 0 || this.x > canvasEl.width || this.y < 0 || this.y > canvasEl.height) this.reset();
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.1, this.size), 0, Math.PI*2);
        ctx.fillStyle = `hsla(${this.hue},80%,60%,${this.opacity})`;
        ctx.fill();
      }
    }

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => new Particle());

    const drawConnections = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i+1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < CONNECTION_DISTANCE) {
            ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,230,138,${(1-dist/CONNECTION_DISTANCE)*0.15})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      if (!isVisible) return;
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      particles.forEach(p => { p.update(); p.draw(); });
      drawConnections();
      animationFrameId = requestAnimationFrame(animate);
    };

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible) animate(); else cancelAnimationFrame(animationFrameId);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (isVisible) animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (!isMobile) window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none z-0" />;
}
