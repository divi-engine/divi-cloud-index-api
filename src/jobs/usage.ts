import { listActiveSites } from '../db/sites.js';
import { refreshDocumentCount } from '../typesense/provision.js';

/**
 * Reconcile document counts from Typesense (weekly cron).
 *
 * Run via cron: npm run cron:usage
 */
async function main() {
  const sites = await listActiveSites();
  let updated = 0;

  for (const site of sites) {
    try {
      const count = await refreshDocumentCount(site);
      updated += 1;
      const pct = site.document_limit > 0 ? Math.round((count / site.document_limit) * 100) : 0;
      if (pct >= 80) {
        console.log(`Site ${site.site_uid}: ${count}/${site.document_limit} documents (${pct}%)`);
      }
    } catch (err) {
      console.error(`Failed usage sync for ${site.site_uid}:`, err);
    }
  }

  console.log(`Usage sync complete for ${updated} site(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
