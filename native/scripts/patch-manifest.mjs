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

// targetSdk configurável via env TARGET_SDK.
//  • APK direto pra testar/distribuir na mão: 33 (o Android 14 apertou os foreground services
//    de localização e o plugin grátis não subia o serviço no 34) → padrão 33.
//  • Play Store EXIGE targetSdk 34+ → o workflow de build passa TARGET_SDK=34.
//    (nesse caso o GPS em background precisa ser validado no track interno; se falhar,
//     fixar versão do plugin ou trocar pelo transistorsoft — ver PLAYSTORE-GUIDE.md)
const TARGET_SDK = process.env.TARGET_SDK || '33';
try {
  const varsPath = 'android/variables.gradle';
  let v = readFileSync(varsPath, 'utf8');
  v = v.replace(/targetSdkVersion\s*=\s*\d+/, `targetSdkVersion = ${TARGET_SDK}`);
  const compile = Math.max(34, Number(TARGET_SDK) || 34);
  v = v.replace(/compileSdkVersion\s*=\s*\d+/, `compileSdkVersion = ${compile}`);
  writeFileSync(varsPath, v);
  console.log(`[patch-manifest] targetSdkVersion → ${TARGET_SDK} / compileSdkVersion → ${compile}`);
} catch (e) {
  console.warn('[patch-manifest] não consegui ajustar variables.gradle:', e.message);
}
