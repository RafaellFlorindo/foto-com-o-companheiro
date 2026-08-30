const hero = document.getElementById('hero');
const sticky = document.getElementById('stickyCta');

if (hero && sticky) {
  const io = new IntersectionObserver(
    ([entry]) => {
      sticky.classList.toggle('show', !entry.isIntersecting);
    },
    { threshold: 0 }
  );
  io.observe(hero);
}
