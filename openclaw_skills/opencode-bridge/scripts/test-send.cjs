const { execSync } = require('child_process');
try {
  const r = execSync(
    'bun x openclaw message send --channel telegram -t 6187953274 -m "Bridge test"',
    { timeout: 15000, stdio: 'pipe' }
  );
  console.log('ok', r.toString());
} catch (e) {
  console.log('err', e.status, e.stderr?.toString().substring(0, 300) || e.message);
}
