// Used by docker-entrypoint.sh on first boot to create persistent secrets
// (JWT signing keys, VAPID keypair) and write them to a file under the
// mounted data volume, so they survive container restarts/recreates
// instead of silently rotating every time (which would invalidate every
// session and every push subscription on every restart). Prints
// bash-sourceable KEY="value" lines to stdout — nothing is printed
// anywhere else, so this is safe to redirect straight into that file.
import crypto from 'node:crypto';
import webpush from 'web-push';

const vapid = webpush.generateVAPIDKeys();

const lines = [
  `JWT_ACCESS_SECRET="${crypto.randomBytes(48).toString('base64')}"`,
  `JWT_REFRESH_SECRET="${crypto.randomBytes(48).toString('base64')}"`,
  `VAPID_PUBLIC_KEY="${vapid.publicKey}"`,
  `VAPID_PRIVATE_KEY="${vapid.privateKey}"`,
];

console.log(lines.join('\n'));
