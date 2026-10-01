// Static policy gate. Runs on the built files in CI and fails the build on:
// storage or logging APIs, submission or synthetic input, dynamic code,
// network calls outside the worker, and any permission beyond the minimum.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export const ALLOWED_PERMISSIONS = ['activeTab', 'scripting'];

export const RULES = [
  { id: 'storage', re: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|chrome\.storage\b|document\.cookie\b|\bcaches\.|\bopenDatabase\b/, why: 'stores data' },
  { id: 'logging', re: /\bconsole\s*\.|\bsendBeacon\b|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\breportError\b/, why: 'logs or sends data out' },
  { id: 'submission', re: /\.submit\s*\(|\brequestSubmit\b|\.click\s*\(|\bKeyboardEvent\b|\bMouseEvent\b|\bPointerEvent\b|\bInputEvent\b/, why: 'could submit a form or fake user input' },
  { id: 'dynamic-code', re: /\beval\s*\(|\bnew\s+Function\b|\bimportScripts\b|set(?:Timeout|Interval)\s*\(\s*['"`]/, why: 'runs code built from strings' },
  { id: 'page-messaging', re: /\bpostMessage\s*\(|\bBroadcastChannel\b/, why: 'talks to the page or other contexts' },
];

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

export async function checkPolicy(distDir) {
  const problems = [];
  const manifest = JSON.parse(await readFile(join(distDir, 'manifest.json'), 'utf8'));
  // Read the origin as text; the check never executes the code it inspects.
  const cfg = await readFile(join(distDir, 'src', 'config.js'), 'utf8');
  const BACKEND_ORIGIN = (/BACKEND_ORIGIN = '(https:\/\/[^']+)'/.exec(cfg) || [])[1];
  if (!BACKEND_ORIGIN) return ['src/config.js: BACKEND_ORIGIN must be an https origin literal'];

  const perms = [...(manifest.permissions || [])].sort();
  if (JSON.stringify(perms) !== JSON.stringify([...ALLOWED_PERMISSIONS].sort())) {
    problems.push(`manifest.json: permissions must be exactly ${ALLOWED_PERMISSIONS.join(', ')}; found ${perms.join(', ') || 'none'}`);
  }
  if (manifest.optional_permissions?.length || manifest.optional_host_permissions?.length) problems.push('manifest.json: optional permissions are not allowed');
  const hosts = manifest.host_permissions || [];
  if (hosts.length !== 1 || hosts[0] !== BACKEND_ORIGIN + '/*') problems.push(`manifest.json: host_permissions must be exactly ${BACKEND_ORIGIN}/*`);
  if (manifest.content_scripts) problems.push('manifest.json: static content_scripts are not allowed (inject on demand only)');
  if (manifest.web_accessible_resources) problems.push('manifest.json: web_accessible_resources are not allowed');
  const csp = manifest.content_security_policy?.extension_pages || '';
  if (!new RegExp(`connect-src ${BACKEND_ORIGIN.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(;|$)`).test(csp)) problems.push('manifest.json: CSP must lock connect-src to the backend origin only');
  if (/unsafe-eval|unsafe-inline/.test(csp)) problems.push('manifest.json: CSP must not allow unsafe-eval or unsafe-inline');

  let fetchCount = 0;
  for (const full of await walk(distDir)) {
    const path = relative(distDir, full).split(sep).join('/');
    if (!/\.(js|html)$/.test(path)) continue;
    const text = await readFile(full, 'utf8');
    for (const rule of RULES) {
      const m = rule.re.exec(text);
      if (m) problems.push(`${path}: "${m[0]}" ${rule.why}`);
    }
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) problems.push(`${path}: inline script`);
    const urls = text.match(/https?:\/\/[^\s'"`)]+/g) || [];
    for (const u of urls) if (!u.startsWith(BACKEND_ORIGIN)) problems.push(`${path}: unexpected URL ${u}`);
    const fetches = (text.match(/\bfetch\s*\(/g) || []).length;
    if (fetches && path !== 'src/background.js') problems.push(`${path}: network call outside the service worker`);
    fetchCount += fetches;
  }
  if (fetchCount > 1) problems.push(`only one network call is allowed (the backend fetch); found ${fetchCount}`);
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] || 'dist';
  const problems = await checkPolicy(dist);
  if (problems.length) {
    process.stdout.write('Policy check failed:\n' + problems.map((p) => '  ' + p).join('\n') + '\n');
    process.exit(1);
  }
  process.stdout.write('Policy check passed: no storage, no logging, no submission, minimal permissions, network locked to backend.\n');
}
