/* Runs in <head>, before anything is drawn. Its one job: if this page was
   reached from another page on this site, say so on <html>, so the entrance
   animation is the short one. The long, staged entrance is for arriving;
   replaying it on every click between pages is what made the site feel slow.
   It has to be a blocking script: decided any later, the long animation has
   already started and switching would restart it. */
try {
  if (document.referrer && new URL(document.referrer).origin === location.origin) {
    document.documentElement.classList.add("is-nav");
  }
} catch (e) {}
