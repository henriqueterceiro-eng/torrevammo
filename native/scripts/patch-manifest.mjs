// Injeta as permissões de localização no AndroidManifest gerado pelo `cap add android`.
// O serviço de foreground (notificação "rastreando") vem do próprio plugin via merge.
import { readFileSync, writeFileSync } from 'fs';

const path = 'android/app/src/main/AndroidManifest.xml';
let xml = readFileSync(path, 'utf8');

const perms = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS'
];

let added = 0;
for (const p of perms) {
  if (!xml.includes(`"${p}"`)) {
    xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
    added++;
  }
}

writeFileSync(path, xml);
console.log(`[patch-manifest] ${added} permissão(ões) adicionada(s) em ${path}`);
