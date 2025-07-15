import React, { useRef, useEffect, useCallback } from 'react';

const AnimatedBackground = ({ colors, adminColor }) => {
    const canvasRef = useRef(null);
    const animationFrameId = useRef(null);
    const particles = useRef([]);
    const maxParticles = 100;
    const connectDistance = 150;
    const particleSpeed = 0.5;

    // Filter out the admin color from the available colors for particles
    const availableColors = colors.filter(color => color !== adminColor);

    const createParticle = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * particleSpeed,
            vy: (Math.random() - 0.5) * particleSpeed,
            radius: Math.random() * 3 + 2, // Slightly larger circles
            color: availableColors[Math.floor(Math.random() * availableColors.length)],
            alpha: Math.random() * 0.5 + 0.1 // Initial alpha for fading
        };
    }, [availableColors]);

    const draw = useCallback((ctx, particle) => {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${parseInt(particle.color.slice(1, 3), 16)}, ${parseInt(particle.color.slice(3, 5), 16)}, ${parseInt(particle.color.slice(5, 7), 16)}, ${particle.alpha})`;
        ctx.fill();
    }, []);

    const update = useCallback((particle) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        particle.x += particle.vx;
        particle.y += particle.vy;

        // Bounce off walls
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        // Fade in/out
        particle.alpha += (Math.random() - 0.5) * 0.02; // Slight random fade
        if (particle.alpha > 0.8) particle.alpha = 0.8;
        if (particle.alpha < 0.1) particle.alpha = 0.1;
    }, []);

    const connectParticles = useCallback((ctx) => {
        for (let i = 0; i < particles.current.length; i++) {
            for (let j = i + 1; j < particles.current.length; j++) {
                const p1 = particles.current[i];
                const p2 = particles.current[j];
                const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

                if (dist < connectDistance) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = `rgba(100, 100, 100, ${1 - (dist / connectDistance) * 0.8})`; // Fading lines
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }, []);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas

        particles.current.forEach(particle => {
            update(particle);
            draw(ctx, particle);
        });

        connectParticles(ctx);

        animationFrameId.current = requestAnimationFrame(animate);
    }, [draw, update, connectParticles]);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            // Re-initialize particles on resize to distribute them correctly
            particles.current = Array.from({ length: maxParticles }, createParticle);
        }
    }, [createParticle]);

    useEffect(() => {
        if (!canvasRef.current || availableColors.length === 0) return;

        resizeCanvas(); // Initial size and particle creation
        window.addEventListener('resize', resizeCanvas);

        // Initialize particles if not already done
        if (particles.current.length === 0) {
            particles.current = Array.from({ length: maxParticles }, createParticle);
        }

        animationFrameId.current = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [createParticle, animate, resizeCanvas, availableColors.length]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed top-0 left-0 w-full h-full z-0 pointer-events-none" // z-0 to be behind everything
            style={{ zIndex: -1 }}
        ></canvas>
    );
};

export default AnimatedBackground;
