/* ═══════════════════════════════════════════════════
   LIMINAL ART BOUTIQUE — App Logic
   ═══════════════════════════════════════════════════ */

// ─── Scroll Reveal Animation ──────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Add reveal class to animated sections
  const revealElements = document.querySelectorAll(
    '.feature, .step, .print-item, .mockup-showcase, .free-card'
  );
  revealElements.forEach(el => el.classList.add('reveal'));

  // Intersection Observer for scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach(el => observer.observe(el));
});


// ─── Email Form ───────────────────────────
// Handled by MailerLite embedded form (Universal JS + data-form="y9JfD0")
// Subscribers are added to "Liminal Art - Free Prints" group
// Automation sends welcome email with 3 Cloudinary download links


// ─── Video Carousel: Play on Hover/Tap ────────────
document.querySelectorAll('.video-wrapper').forEach(wrapper => {
  const video = wrapper.querySelector('video');
  if (!video) return;

  // Desktop: hover to play
  wrapper.addEventListener('mouseenter', () => {
    video.play().catch(() => {});
  });
  wrapper.addEventListener('mouseleave', () => {
    video.pause();
    video.currentTime = 0;
  });

  // Mobile: tap to play/pause
  wrapper.addEventListener('click', () => {
    if (video.paused) {
      // Pause all others first
      document.querySelectorAll('.video-wrapper video').forEach(v => {
        if (v !== video) { v.pause(); v.currentTime = 0; }
      });
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  // Auto-play when scrolled into view (mobile)
  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && window.innerWidth < 768) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.6 });

  videoObserver.observe(wrapper);
});


// ─── Smooth Scroll for Anchor Links ───────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
