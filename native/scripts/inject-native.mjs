// Injeta o código nativo custom (plugin da bolinha flutuante) no projeto Android que o
// `npx cap add android` gera do zero a cada build. Roda DEPOIS do cap add e ANTES do cap sync/build.
// Copia VammoBubblePlugin.java + a MainActivity que registra o plugin pro pacote do app.
import { copyFileSync, mkdirSync, existsSync } from 'fs';

const pkgDir = 'android/app/src/main/java/com/vammo/colab';
if (!existsSync(pkgDir)) mkdirSync(pkgDir, { recursive: true });

copyFileSync('native-src/VammoBubblePlugin.java', pkgDir + '/VammoBubblePlugin.java');
copyFileSync('native-src/MainActivity.java', pkgDir + '/MainActivity.java');

console.log('[inject-native] VammoBubblePlugin.java + MainActivity.java (registra o plugin) injetados em ' + pkgDir);
