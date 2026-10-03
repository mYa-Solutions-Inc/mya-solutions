/* ═══════════════════════════════════════════════════════════════════════
   FILE / ROOT:  assets/js/jean-config.js  (mYa Solutions website)
   DESCRIPTION:  Where the website finds Jean's answer service.
                 Paste the Cloud Run URL that services/jean-site/deploy.sh
                 prints, e.g. "https://jean-site-abc123-uw.a.run.app".
                 Left empty, Jean still works in search-only mode: she points
                 visitors to the closest part of the site and says plainly
                 that full answers are offline.
   ═══════════════════════════════════════════════════════════════════════ */
window.JEAN_ENDPOINT = "https://jean-site-41235504052.us-west1.run.app";
