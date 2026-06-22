import { getEnv } from '../config.js';
import { listSitesForCleanup } from '../db/sites.js';
import { deprovisionSite } from '../typesense/provision.js';

/**
 * Daily cleanup: expired trials and cancelled subscriptions past grace.
 *
 * Run via cron: npm run cron:cleanup
 */
async function main() {
  const env = getEnv();
  const now = Date.now();
  const sites = await listSitesForCleanup();
  let deprovisioned = 0;

  for (const site of sites) {
    let shouldDeprovision = false;

    if (site.status === 'expired') {
      continue;
    }

    if (site.status === 'trialing' && site.trial_ends_at && site.trial_ends_at.getTime() < now) {
      shouldDeprovision = true;
    }

    if (site.status === 'cancelled' && site.grace_ends_at && site.grace_ends_at.getTime() < now) {
      shouldDeprovision = true;
    }

    if (site.status === 'past_due') {
      const grace = site.grace_ends_at?.getTime() ?? 0;
      const fallbackGrace = site.updated_at.getTime() + env.CLOUD_INDEX_CANCEL_GRACE_DAYS * 86400000;
      if ((grace && grace < now) || fallbackGrace < now) {
        shouldDeprovision = true;
      }
    }

    if (shouldDeprovision) {
      await deprovisionSite(site.site_uid);
      deprovisioned += 1;
      console.log(`Deprovisioned site ${site.site_uid} (${site.site_id_short})`);
    }
  }

  console.log(`Cleanup complete. Deprovisioned ${deprovisioned} site(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
